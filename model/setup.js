const pool = require("./db");

const createUsersTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'guest',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    
    console.log("Users table ensured with updated_at column");
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
    
    // Add company column if it doesn't exist (for existing tables)
    await pool.query(`
      ALTER TABLE frontend_projects 
      ADD COLUMN IF NOT EXISTS company VARCHAR(255);
    `);
    
    console.log("Frontend projects table ensured with company column");
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
    
    // Add company column if it doesn't exist (for existing tables)
    await pool.query(`
      ALTER TABLE mobile_apps 
      ADD COLUMN IF NOT EXISTS company VARCHAR(255);
    `);
    
    console.log("Mobile apps table ensured with company column");
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
    
    // Add company column if it doesn't exist (for existing tables)
    await pool.query(`
      ALTER TABLE backend_projects 
      ADD COLUMN IF NOT EXISTS company VARCHAR(255);
    `);
    
    console.log('Backend projects table ensured with company column');
  } catch (err) {
    console.error('Error creating backend projects table:', err);
  }
};

const setupDatabase = async () => {
  try {
    await createUsersTable();
    await createFrontendProjectsTable();
    await createMobileAppsTable();
    await createBackendProjectsTable();
    console.log("All database setup tasks completed successfully");
  } catch (error) {
    console.error("Database setup failed", error);
    throw error;
  }
};

module.exports = { setupDatabase };