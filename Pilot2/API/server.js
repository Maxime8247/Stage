const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuration des Middlewares
app.use(cors());
app.use(express.json());

// Connexion à la base de données PostGIS via le Pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

/**
 * 1. ENDPOINT : Récupération des Points (Table: others_database_woc1_2)
 */
app.get('/api/points', async (req, res) => {
  try {
    const query = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(geom)::jsonb,
            'properties', jsonb_build_object(
              'id', id,
              'WoCid', "WoCid",
              'Crayfish_scientific_name', "Crayfish_scientific_name",
              'Status', "Status",
              'Pathogen_symbiont_scientific_name', "Pathogen_symbiont_scientific_name"
            )
          )
        )
      ) AS geojson
      FROM others_database_woc1_2;
    `;
    const result = await pool.query(query);
    res.json(result.rows[0].geojson || { type: 'FeatureCollection', features: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des points' });
  }
});

/**
 * 2. ENDPOINT : Récupération des Rivières (Table: rivers_romania)
 * Fusionne proprement la colonne 'properties' (jsonb) pour Leaflet
 */
app.get('/api/rivers', async (req, res) => {
  try {
    const query = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(ST_Simplify(geom, 0.001))::jsonb,
            'properties', properties || jsonb_build_object('id', id, 'src_file', src_file)
          )
        )
      ) AS geojson
      FROM rivers_romania;
    `;
    const result = await pool.query(query);
    res.json(result.rows[0].geojson || { type: 'FeatureCollection', features: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des rivières' });
  }
});

/**
 * 3. ENDPOINT : Récupération des Contours (Table: contours_romania)
 */
app.get('/api/contours', async (req, res) => {
  try {
    const query = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', jsonb_agg(
          jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(ST_Simplify(geom, 0.005))::jsonb,
            'properties', properties || jsonb_build_object('id', id, 'src_file', src_file)
          )
        )
      ) AS geojson
      FROM contours_romania;
    `;
    const result = await pool.query(query);
    res.json(result.rows[0].geojson || { type: 'FeatureCollection', features: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des contours' });
  }
});

/**
 * 4. ENDPOINT RASTER : Récupération de l'altitude au clic sur la carte
 * Optimisé avec l'opérateur de boîte englobante (&&) pour de meilleures performances
 */
app.get('/api/elevation', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Paramètres lat et lng requis.' });
  }

  try {
    const query = `
      SELECT ST_Value(rast, ST_SetSRID(ST_Point($1, $2), 4326)) AS altitude
      FROM pilot2_raster_elevation_30m_romania
      WHERE rast && ST_SetSRID(ST_Point($1, $2), 4326)
      LIMIT 1;
    `;
    const result = await pool.query(query, [parseFloat(lng), parseFloat(lat)]);
    
    if (result.rows.length > 0 && result.rows[0].altitude !== null) {
      res.json({ altitude: Math.round(result.rows[0].altitude) });
    } else {
      res.json({ altitude: null, message: "Coordonnées hors de la zone raster ou valeur de nodata" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'interrogation du raster d'élévation" });
  }
});

// Démarrage de l'application
app.listen(port, () => {
  console.log(`Serveur Jumeau Numérique connecté sur http://localhost:${port}`);
});