const { randomBytes } = require('crypto');
const { default: migrate } = require('node-pg-migrate');
const format = require('pg-format');
const pool = require('../../pool');

const DEFAULT_OPTS = {
  host: 'localhost',
  port: '5432',
  database: 'socialnetwork-test',
  user: 'levblancx',
  password: '',
};
class Context {
  static async build() {
    // Randomly generating a role name to connect to PG as
    const roleName = 'a' + randomBytes(4).toString('hex');

    // Connect to PG as usual
    await pool.connect(DEFAULT_OPTS);

    // Create a new role
    // %I: identifiers. E.g.: table name, column names
    // %L: literal values
    await pool.query(
      format('CREATE ROLE %I WITH LOGIN PASSWORD %L;', roleName, roleName)
    );

    // Create a schema with the same name
    await pool.query(
      format('CREATE SCHEMA %I AUTHORIZATION %I;', roleName, roleName)
    );

    // Disconnect entirely from PG
    await pool.close();

    // Run our migrations in the new schema
    await migrate({
      schema: roleName,
      direction: 'up',
      // silence the logs since we are doint tests here
      log: () => {},
      // tell PG not to lock up the db while we are doing migrations in parallel
      noLock: true,
      dir: 'migrations',
      databaseUrl: {
        host: 'localhost',
        port: '5432',
        database: 'socialnetwork-test',
        user: roleName,
        password: roleName,
      },
    });

    // Connect to PG as the newly created role
    await pool.connect({
      host: 'localhost',
      port: '5432',
      database: 'socialnetwork-test',
      user: roleName,
      password: roleName,
    });

    return new Context(roleName);
  }

  constructor(roleName) {
    this.roleName = roleName;
  }

  async reset() {
    return pool.query(`DELETE FROM users;`);
  }

  async close() {
    // Disconnect from PG
    await pool.close();
    // Reconnect as our root user
    await pool.connect(DEFAULT_OPTS);
    // Delete the role and schema we created
    await pool.query(format('DROP SCHEMA %I CASCADE;', this.roleName));
    await pool.query(format('DROP ROLE %I;', this.roleName));
    // Disconnect
    await pool.close();
  }
}

module.exports = Context;
