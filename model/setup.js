const pool = require("./db");

const createUsersTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'guest',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Users table ensured");
  } catch (err) {
    console.error("Error creating users table:", err);
  }
};

const createFrontendProjectsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS frontend_projects (
        id SERIAL PRIMARY KEY,
        project_name VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        stacks TEXT[] NOT NULL,
        category VARCHAR(100) NOT NULL,
        company VARCHAR(255),
        project_link TEXT,
        github_link TEXT,
        created_by_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Frontend projects table ensured");
  } catch (err) {
    console.error("Error creating frontend projects table:", err);
  }
};

const createMobileAppsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mobile_apps (
        id SERIAL PRIMARY KEY,
        project_name VARCHAR(255) NOT NULL,
        industry VARCHAR(100) NOT NULL,
        stacks TEXT[] NOT NULL,
        designer VARCHAR(255),
        designer_link TEXT,
        company VARCHAR(255),
        status VARCHAR(100) DEFAULT 'in_progress',
        media JSONB DEFAULT '[]'::jsonb,
        project_link TEXT,
        github_link TEXT,
        created_by_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Mobile apps table ensured");
  } catch (err) {
    console.error("Error creating mobile apps table:", err);
  }
};

const createBackendProjectsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS backend_projects (
        id SERIAL PRIMARY KEY,
        project_name VARCHAR(255) NOT NULL,
        stack TEXT[] NOT NULL,
        description TEXT NOT NULL,
        code TEXT,
        image TEXT,
        company VARCHAR(255),
        github_link TEXT,
        project_link TEXT,
        created_by_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Backend projects table ensured');
  } catch (err) {
    console.error('Error creating backend projects table:', err);
  }
};

// Migration function to add designer_link column to existing mobile_apps table
const addDesignerLinkColumn = async () => {
  try {
    // Check if designer_link column already exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'mobile_apps' 
      AND column_name = 'designer_link'
    `);

    if (columnCheck.rows.length === 0) {
      await pool.query(`
        ALTER TABLE mobile_apps 
        ADD COLUMN designer_link TEXT
      `);
      console.log("Designer link column added to mobile_apps table");
    } else {
      console.log("Designer link column already exists in mobile_apps table");
    }
  } catch (err) {
    console.error("Error adding designer_link column:", err);
  }
};

const setupDatabase = async () => {
  try {
    await createUsersTable();
    await createFrontendProjectsTable();
    await createMobileAppsTable();
    await createBackendProjectsTable();
    
    // Run migration to add designer_link column if it doesn't exist
    await addDesignerLinkColumn();
    
    console.log("All database setup tasks completed successfully");
  } catch (error) {
    console.error("Database setup failed", error);
    throw error;
  }
};

module.exports = { setupDatabase };