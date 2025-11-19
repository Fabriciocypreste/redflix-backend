const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'redflix.db');

// Middleware
app.use(cors());
app.use(express.json());

// Conectar ao banco
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err.message);
  } else {
    console.log('✅ Conectado ao banco de dados SQLite');
  }
});

// Helper para promisificar queries
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// GET /api/series - Listar todas as séries
app.get('/api/series', async (req, res) => {
  try {
    const series = await dbAll(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM episodes WHERE series_id = s.id) as total_episodes,
        (SELECT COUNT(DISTINCT season) FROM episodes WHERE series_id = s.id) as total_seasons
      FROM series s
      ORDER BY s.title
    `);
    
    res.json({
      success: true,
      count: series.length,
      data: series
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/series/:id - Detalhes de uma série
app.get('/api/series/:id', async (req, res) => {
  try {
    const series = await dbGet('SELECT * FROM series WHERE id = ?', [req.params.id]);
    
    if (!series) {
      return res.status(404).json({ success: false, message: 'Série não encontrada' });
    }
    
    const episodes = await dbAll(
      'SELECT * FROM episodes WHERE series_id = ? ORDER BY season, episode',
      [req.params.id]
    );
    
    // Organizar por temporadas
    const seasons = {};
    episodes.forEach(ep => {
      if (!seasons[ep.season]) {
        seasons[ep.season] = [];
      }
      seasons[ep.season].push(ep);
    });
    
    res.json({
      success: true,
      data: { ...series, seasons, episodes }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/channels - Listar todos os canais
app.get('/api/channels', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    const channels = await dbAll(
      'SELECT * FROM channels ORDER BY name LIMIT ? OFFSET ?',
      [limit, offset]
    );
    
    const total = await dbGet('SELECT COUNT(*) as count FROM channels');
    
    res.json({
      success: true,
      count: channels.length,
      total: total.count,
      data: channels
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/channels/:id - Detalhes de um canal
app.get('/api/channels/:id', async (req, res) => {
  try {
    const channel = await dbGet('SELECT * FROM channels WHERE id = ?', [req.params.id]);
    
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Canal não encontrado' });
    }
    
    res.json({
      success: true,
      data: channel
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/search - Buscar conteúdo
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    
    if (!query) {
      return res.json({ success: true, data: { series: [], channels: [] } });
    }
    
    const series = await dbAll(
      'SELECT * FROM series WHERE title LIKE ? LIMIT 20',
      [`%${query}%`]
    );
    
    const channels = await dbAll(
      'SELECT * FROM channels WHERE name LIKE ? LIMIT 20',
      [`%${query}%`]
    );
    
    res.json({
      success: true,
      data: { series, channels }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/stats - Estatísticas
app.get('/api/stats', async (req, res) => {
  try {
    const seriesCount = await dbGet('SELECT COUNT(*) as count FROM series');
    const episodesCount = await dbGet('SELECT COUNT(*) as count FROM episodes');
    const channelsCount = await dbGet('SELECT COUNT(*) as count FROM channels');
    const platforms = await dbAll('SELECT DISTINCT platform FROM series');
    
    res.json({
      success: true,
      data: {
        totalSeries: seriesCount.count,
        totalEpisodes: episodesCount.count,
        totalChannels: channelsCount.count,
        totalPlatforms: platforms.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: DB_PATH
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', async () => {
  try {
    const stats = await dbGet(`
      SELECT 
        (SELECT COUNT(*) FROM series) as series,
        (SELECT COUNT(*) FROM episodes) as episodes,
        (SELECT COUNT(*) FROM channels) as channels
    `);
    
    console.log(`\n🚀 Backend API rodando em http://0.0.0.0:${PORT}`);
    console.log(`\n📊 Conteúdo disponível:`);
    console.log(`   - ${stats.series} séries`);
    console.log(`   - ${stats.episodes} episódios`);
    console.log(`   - ${stats.channels} canais`);
    console.log(`\n📡 Endpoints disponíveis:`);
    console.log(`   GET /api/series`);
    console.log(`   GET /api/series/:id`);
    console.log(`   GET /api/channels`);
    console.log(`   GET /api/channels/:id`);
    console.log(`   GET /api/search?q=termo`);
    console.log(`   GET /api/stats`);
    console.log(`   GET /health\n`);
  } catch (error) {
    console.error('Erro ao carregar estatísticas:', error.message);
  }
});
