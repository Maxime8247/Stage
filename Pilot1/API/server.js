// ─────────────────────────────────────────
//  On importe les modules nécessaires
//  express  → framework web pour créer l'API
//  cors     → autorise le frontend à appeler l'API
//  pg       → pilote pour parler à PostgreSQL
//  dotenv   → lit les variables du fichier .env
// ─────────────────────────────────────────
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();


app.use(cors());

//
app.use(express.json());

// ─────────────────────────────────────────
//  Connexion à PostgreSQL
//  Pool = un groupe de connexions réutilisables
//  Les valeurs viennent du fichier .env
// ─────────────────────────────────────────
const pool = new Pool({
    host:      process.env.DB_HOST,      // ex: localhost
    port:      process.env.DB_PORT,      // ex: 5432
    database: process.env.DB_NAME,      // stage_digital_twin
    user:      process.env.DB_USER,      // postgres
    password: process.env.DB_PASSWORD,  // votre mot de passe
});

// On teste la connexion dès le démarrage du serveur
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Erreur connexion PostgreSQL :', err.message);
    } else {
        console.log('✅ Connecté à PostgreSQL — base :', process.env.DB_NAME);
        release();
    }
});

// ─────────────────────────────────────────
//  Route /ping
// ─────────────────────────────────────────
app.get('/ping', (req, res) => {
    res.json({ message: 'API pilot1 OK !' });
});

// ─────────────────────────────────────────
//  Route /db-test
// ─────────────────────────────────────────
app.get('/db-test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() AS time');
        res.json({
            status: 'ok',
            db:     process.env.DB_NAME,
            time:   result.rows[0].time,
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ─────────────────────────────────────────
//  Route /api/roads
// ─────────────────────────────────────────
app.get('/api/roads', async (req, res) => {
    const {
        minx = -0.6, miny = 51.4,
        maxx =  0.5, maxy = 52.0,
    } = req.query;

    try {
        const result = await pool.query(`
            SELECT
                id,
                ST_AsGeoJSON(geom) AS geometry,
                properties
            FROM road_network
            WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            LIMIT 5000
        `, [minx, miny, maxx, maxy]);

        const features = result.rows.map(({ geometry, ...props }) => ({
            type:       'Feature',
            geometry:   JSON.parse(geometry),
            properties: { id: props.id, ...props.properties } 
        }));

        res.json({
            type:     'FeatureCollection',
            features,
            meta:     { count: features.length },
        });

    } catch (err) {
        console.error('Erreur /api/roads :', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  Route /api/rivers
// ─────────────────────────────────────────
app.get('/api/rivers', async (req, res) => {
    const {
        minx = -0.6, miny = 51.4,
        maxx =  0.5, maxy = 52.0,
    } = req.query;

    try {
        const result = await pool.query(`
            SELECT
                id,
                ST_AsGeoJSON(geom) AS geometry,
                properties
            FROM os_open_rivers
            WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            LIMIT 3000
        `, [minx, miny, maxx, maxy]);

        const features = result.rows.map(({ geometry, ...props }) => ({
            type:       'Feature',
            geometry:   JSON.parse(geometry),
            properties: { id: props.id, ...props.properties }
        }));

        res.json({ type: 'FeatureCollection', features, meta: { count: features.length } });

    } catch (err) {
        console.error('Erreur /api/rivers :', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  NOUVELLE ROUTE : POST /api/simulate-rain
//  Calcule les inondations avec ST_Buffer
// ─────────────────────────────────────────
app.post('/api/simulate-rain', async (req, res) => {
    const { centerLng, centerLat, radiusMeters, intensity } = req.body;

    if (!centerLng || !centerLat || !radiusMeters) {
        return res.status(400).json({ error: 'Données manquantes (centerLng, centerLat, radiusMeters).' });
    }

    try {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // 1. Trouver les rivières qui touchent le cercle de pluie dessiné
            // ST_Transform en 3857 permet d'appliquer un rayon précis en mètres
            const riversQuery = `
                SELECT id 
                FROM os_open_rivers
                WHERE ST_Intersects(
                    geom,
                    ST_Transform(
                        ST_Buffer(ST_Transform(ST_SetSRID(ST_Point($1, $2), 4326), 3857), $3), 
                        4326
                    )
                );
            `;
            const riversResult = await client.query(riversQuery, [centerLng, centerLat, radiusMeters]);

            // 2. Créer un ST_Buffer de sécurité (ici 50 mètres) autour de ces rivières impactées, 
            // et chercher les routes qui intersectent cette zone tampon.
            const roadsQuery = `
                WITH flooded_rivers AS (
                    SELECT ST_Buffer(ST_Transform(geom, 3857), 50) AS buffered_geom
                    FROM os_open_rivers
                    WHERE ST_Intersects(
                        geom,
                        ST_Transform(
                            ST_Buffer(ST_Transform(ST_SetSRID(ST_Point($1, $2), 4326), 3857), $3), 
                            4326
                        )
                    )
                )
                SELECT r.id,
                       CASE WHEN $4 >= 50 THEN 'danger' ELSE 'warning' END AS flood_status
                FROM road_network r
                JOIN flooded_rivers f ON ST_Intersects(ST_Transform(r.geom, 3857), f.buffered_geom)
                GROUP BY r.id;
            `;
            const roadsResult = await client.query(roadsQuery, [centerLng, centerLat, radiusMeters, intensity]);

            await client.query('COMMIT');

            // Renvoie uniquement les listes d'IDs concernés pour que le front mette à jour les épaisseurs/couleurs
            res.json({
                rivers: riversResult.rows,
                roads: roadsResult.rows
            });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('Erreur /api/simulate-rain :', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  Route /api/flood-risk
// ─────────────────────────────────────────
app.get('/api/flood-risk', async (req, res) => {
    const {
        type = 'river',
        minx = -0.6, miny = 51.4,
        maxx =  0.5, maxy = 52.0,
    } = req.query;

    const tableMap = {
        river:   'risk_of_flooding_from_rivers_and_sea',
        surface: 'risk_of_flooding_from_surface_water',
        climate: 'risk_of_flooding_from_surface_water__climate_change_1',
    };
    const table = tableMap[type];

    if (!table) {
        return res.status(400).json({ error: `Type invalide : ${type}` });
    }

    try {
        const result = await pool.query(`
            SELECT ST_AsGeoJSON(geom) AS geometry, properties
            FROM ${table}
            WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            LIMIT 3000
        `, [minx, miny, maxx, maxy]);

        const features = result.rows.map(({ geometry, ...props }) => ({
            type: 'Feature',
            geometry: JSON.parse(geometry),
            properties: props,
        }));

        res.json({ type: 'FeatureCollection', features, meta: { count: features.length } });

    } catch (err) {
        console.error('Erreur /api/flood-risk :', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────
//  Démarrage du serveur
// ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ API pilot1 démarrée sur http://localhost:${PORT}`);
    console.log(`   GET  /ping`);
    console.log(`   GET  /db-test`);
    console.log(`   GET  /api/roads`);
    console.log(`   GET  /api/rivers`);
    console.log(`   POST /api/simulate-rain`);
    console.log(`   GET  /api/flood-risk?type=river|surface|climate`);
});