use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Instant;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbConnectionConfig {
    pub id: String,
    pub name: String,
    pub engine: String, // "mysql", "postgres", "sqlite", "redis", "mongodb"
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
    pub ssl: Option<bool>,
    pub sqlite_path: Option<String>,
    pub is_remote_sqlite: Option<bool>,
    pub ssh_tunnel_enabled: Option<bool>,
    pub ssh_session_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbColumnMeta {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
    pub default_value: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbTableMeta {
    pub name: String,
    pub schema: Option<String>,
    pub table_type: String, // "TABLE", "VIEW", "COLLECTION", "KEY_PREFIX"
    pub row_count: Option<i64>,
    pub columns: Vec<DbColumnMeta>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbSchemaOverview {
    pub databases: Vec<String>,
    pub current_database: Option<String>,
    pub tables: Vec<DbTableMeta>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbQueryResult {
    pub statement: Option<String>,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub affected_rows: u64,
    pub execution_time_ms: u64,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbServerMetrics {
    pub engine: String,
    pub uptime_seconds: u64,
    pub version: String,
    pub active_connections: i64,
    pub max_connections: i64,
    pub queries_count: i64,
    pub memory_used_bytes: Option<u64>,
    pub memory_peak_bytes: Option<u64>,
    pub cache_hit_rate_pct: Option<f64>,
    pub extra_info: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbExplainResult {
    pub format: String, // "json" | "table" | "text"
    pub raw_output: String,
    pub warnings: Vec<String>,
    pub suggestions: Vec<String>,
    pub has_full_table_scan: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbProcessItem {
    pub id: i64,
    pub user: String,
    pub host: String,
    pub db: Option<String>,
    pub command: String,
    pub time_seconds: i64,
    pub state: Option<String>,
    pub info: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbForeignKeyRelation {
    pub from_table: String,
    pub from_column: String,
    pub to_table: String,
    pub to_column: String,
    pub constraint_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbUserItem {
    pub username: String,
    pub host: String,
    pub privileges: Vec<String>,
    pub is_superuser: bool,
}

pub const MONGO_UNSUPPORTED_EXEC: &str =
    "MongoDB belum didukung untuk eksekusi query. Koneksi TCP diuji, tetapi tidak ada driver MongoDB yang aktif.";
pub const MONGO_UNSUPPORTED_SCHEMA: &str =
    "MongoDB belum didukung untuk pembacaan skema. Koneksi TCP diuji, tetapi tidak ada driver MongoDB yang aktif.";

pub struct DbmsManager {
    mysql_pools: Arc<Mutex<HashMap<String, sqlx::MySqlPool>>>,
    pg_pools: Arc<Mutex<HashMap<String, sqlx::PgPool>>>,
    sqlite_pools: Arc<Mutex<HashMap<String, sqlx::SqlitePool>>>,
}

fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~' => out.push(*byte as char),
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_backtick = false;

    for c in sql.chars() {
        if c == '\'' && !in_double_quote && !in_backtick {
            in_single_quote = !in_single_quote;
            current.push(c);
        } else if c == '"' && !in_single_quote && !in_backtick {
            in_double_quote = !in_double_quote;
            current.push(c);
        } else if c == '`' && !in_single_quote && !in_double_quote {
            in_backtick = !in_backtick;
            current.push(c);
        } else if c == ';' && !in_single_quote && !in_double_quote && !in_backtick {
            let stmt = current.trim().to_string();
            if !stmt.is_empty() {
                statements.push(stmt);
            }
            current.clear();
        } else {
            current.push(c);
        }
    }

    let leftover = current.trim().to_string();
    if !leftover.is_empty() {
        statements.push(leftover);
    }

    if statements.is_empty() && !sql.trim().is_empty() {
        statements.push(sql.trim().to_string());
    }

    statements
}

fn quote_mysql_identifier(identifier: &str) -> String {
    format!("`{}`", identifier.replace('`', "``"))
}

const SQLITE_SCHEMA_QUERY: &str = "SELECT m.name,
                                m.type,
                                p.name,
                                p.type,
                                p.\"notnull\",
                                p.pk,
                                p.dflt_value
                         FROM sqlite_master AS m
                         JOIN pragma_table_info(m.name) AS p
                         WHERE m.type IN ('table', 'view')
                           AND m.name NOT LIKE 'sqlite_%'
                         ORDER BY m.name, p.cid";

type SqliteMetadataRow = (String, String, String, String, i64, i64, Option<String>);

async fn fetch_sqlite_metadata(
    pool: &sqlx::SqlitePool,
) -> Result<Vec<SqliteMetadataRow>, sqlx::Error> {
    sqlx::query_as(SQLITE_SCHEMA_QUERY).fetch_all(pool).await
}

impl DbmsManager {
    pub fn new() -> Self {
        Self {
            mysql_pools: Arc::new(Mutex::new(HashMap::new())),
            pg_pools: Arc::new(Mutex::new(HashMap::new())),
            sqlite_pools: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn build_mysql_url(config: &DbConnectionConfig) -> String {
        let user = config.username.as_deref().unwrap_or("root");
        let pass = config.password.as_deref().unwrap_or("");
        let host = config.host.as_deref().unwrap_or("127.0.0.1");
        let port = config.port.unwrap_or(3306);
        let db = config.database.as_deref().unwrap_or("");

        let auth = if pass.is_empty() {
            percent_encode(user)
        } else {
            format!("{}:{}", percent_encode(user), percent_encode(pass))
        };

        if db.is_empty() {
            format!("mysql://{}@{}:{}", auth, host, port)
        } else {
            format!("mysql://{}@{}:{}/{}", auth, host, port, percent_encode(db))
        }
    }

    pub fn build_pg_url(config: &DbConnectionConfig) -> String {
        let user = config.username.as_deref().unwrap_or("postgres");
        let pass = config.password.as_deref().unwrap_or("");
        let host = config.host.as_deref().unwrap_or("127.0.0.1");
        let port = config.port.unwrap_or(5432);
        let db = config.database.as_deref().unwrap_or("postgres");

        let auth = if pass.is_empty() {
            percent_encode(user)
        } else {
            format!("{}:{}", percent_encode(user), percent_encode(pass))
        };

        format!("postgres://{}@{}:{}/{}", auth, host, port, percent_encode(db))
    }

    pub fn build_redis_url(config: &DbConnectionConfig) -> String {
        let host = config.host.as_deref().unwrap_or("127.0.0.1");
        let port = config.port.unwrap_or(6379);
        let pass = config.password.as_deref().unwrap_or("");
        let user = config.username.as_deref().unwrap_or("");

        if pass.is_empty() && user.is_empty() {
            format!("redis://{}:{}", host, port)
        } else if user.is_empty() {
            format!("redis://:{}@{}:{}", percent_encode(pass), host, port)
        } else {
            format!(
                "redis://{}:{}@{}:{}",
                percent_encode(user),
                percent_encode(pass),
                host,
                port
            )
        }
    }

    async fn mysql_pool(&self, url: &str) -> Result<sqlx::MySqlPool, String> {
        if let Some(pool) = self.mysql_pools.lock().get(url).cloned() {
            if !pool.is_closed() {
                return Ok(pool);
            }
        }

        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(1)
            .idle_timeout(std::time::Duration::from_secs(600))
            .max_lifetime(std::time::Duration::from_secs(1800))
            .connect(url)
            .await
            .map_err(|e| format!("MySQL error: {}", e))?;
        self.mysql_pools
            .lock()
            .insert(url.to_string(), pool.clone());
        Ok(pool)
    }

    async fn pg_pool(&self, url: &str) -> Result<sqlx::PgPool, String> {
        if let Some(pool) = self.pg_pools.lock().get(url).cloned() {
            if !pool.is_closed() {
                return Ok(pool);
            }
        }

        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(1)
            .idle_timeout(std::time::Duration::from_secs(600))
            .max_lifetime(std::time::Duration::from_secs(1800))
            .connect(url)
            .await
            .map_err(|e| format!("PostgreSQL error: {}", e))?;
        self.pg_pools
            .lock()
            .insert(url.to_string(), pool.clone());
        Ok(pool)
    }

    async fn sqlite_pool(&self, url: &str) -> Result<sqlx::SqlitePool, String> {
        if let Some(pool) = self.sqlite_pools.lock().get(url).cloned() {
            if !pool.is_closed() {
                return Ok(pool);
            }
        }

        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .idle_timeout(std::time::Duration::from_secs(600))
            .max_lifetime(std::time::Duration::from_secs(1800))
            .connect(url)
            .await
            .map_err(|e| format!("SQLite error: {}", e))?;
        self.sqlite_pools
            .lock()
            .insert(url.to_string(), pool.clone());
        Ok(pool)
    }

    pub async fn test_connection(&self, config: &DbConnectionConfig) -> Result<String, String> {
        match config.engine.to_lowercase().as_str() {
            "mysql" | "mariadb" => {
                let url = Self::build_mysql_url(config);
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(1)
                    .acquire_timeout(std::time::Duration::from_secs(5))
                    .connect(&url)
                    .await
                    .map_err(|e| format!("MySQL connection failed: {}", e))?;

                let row: (String,) = sqlx::query_as("SELECT VERSION()")
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| format!("Failed to query MySQL version: {}", e))?;

                pool.close().await;
                Ok(format!("Connected to MySQL successfully! Version: {}", row.0))
            }
            "postgres" | "postgresql" => {
                let url = Self::build_pg_url(config);
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .acquire_timeout(std::time::Duration::from_secs(5))
                    .connect(&url)
                    .await
                    .map_err(|e| format!("PostgreSQL connection failed: {}", e))?;

                let row: (String,) = sqlx::query_as("SELECT VERSION()")
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| format!("Failed to query PostgreSQL version: {}", e))?;

                pool.close().await;
                Ok(format!("Connected to PostgreSQL successfully! {}", row.0))
            }
            "sqlite" => {
                let path = config
                    .sqlite_path
                    .as_deref()
                    .ok_or_else(|| "Path file SQLite belum ditentukan".to_string())?;

                if !std::path::Path::new(path).exists() {
                    return Err(format!("File SQLite tidak ditemukan: {}", path));
                }

                let url = format!("sqlite://{}", path);
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("SQLite connection failed: {}", e))?;

                let row: (String,) = sqlx::query_as("SELECT sqlite_version()")
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| format!("Failed to query SQLite version: {}", e))?;

                pool.close().await;
                Ok(format!("Connected to SQLite database successfully! Version: {}", row.0))
            }
            "redis" => {
                let url = Self::build_redis_url(config);

                let client = redis::Client::open(url).map_err(|e| format!("Redis Client error: {}", e))?;
                let mut conn = client
                    .get_multiplexed_async_connection()
                    .await
                    .map_err(|e| format!("Redis connection failed: {}", e))?;

                let pong: String = redis::cmd("PING")
                    .query_async(&mut conn)
                    .await
                    .map_err(|e| format!("Redis PING failed: {}", e))?;

                Ok(format!("Connected to Redis successfully! Response: {}", pong))
            }
            "mongodb" => {
                let host = config.host.as_deref().unwrap_or("127.0.0.1");
                let port = config.port.unwrap_or(27017);
                // Basic TCP ping check for MongoDB port
                let addr = format!("{}:{}", host, port);
                let timeout = std::time::Duration::from_secs(5);
                tokio::time::timeout(timeout, tokio::net::TcpStream::connect(&addr))
                    .await
                    .map_err(|_| "MongoDB connection timed out".to_string())?
                    .map_err(|e| format!("Failed to reach MongoDB port {}: {}", addr, e))?;

                Ok(format!("Connected to MongoDB host at {} successfully!", addr))
            }
            other => Err(format!("Database engine tidak didukung: {}", other)),
        }
    }

    async fn scan_keys(
        conn: &mut redis::aio::MultiplexedConnection,
        limit: usize,
    ) -> Result<Vec<String>, String> {
        const COUNT: &str = "500";
        const MAX_ITERATIONS: usize = 100;

        let mut keys: Vec<String> = Vec::new();
        let mut cursor: u64 = 0;

        for _ in 0..MAX_ITERATIONS {
            if keys.len() >= limit {
                break;
            }

            let (next_cursor, batch): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg("*")
                .arg("COUNT")
                .arg(COUNT)
                .query_async(conn)
                .await
                .map_err(|e| format!("Redis SCAN failed: {}", e))?;

            for key in batch {
                keys.push(key);
                if keys.len() >= limit {
                    break;
                }
            }

            if next_cursor == 0 {
                break;
            }
            cursor = next_cursor;
        }

        Ok(keys)
    }

    pub async fn get_schema_overview(
        &self,
        config: &DbConnectionConfig,
        selected_db: Option<String>,
    ) -> Result<DbSchemaOverview, String> {
        match config.engine.to_lowercase().as_str() {
            "mysql" | "mariadb" => {
                let mut cfg = config.clone();
                if let Some(ref db) = selected_db {
                    cfg.database = Some(db.clone());
                }
                let url = Self::build_mysql_url(&cfg);
                let pool = self.mysql_pool(&url).await?;

                let db_rows: Vec<(String,)> = sqlx::query_as("SHOW DATABASES")
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();
                let databases: Vec<String> = db_rows.into_iter().map(|r| r.0).collect();

                let cur_db = cfg.database.clone().or_else(|| databases.first().cloned());
                let mut tables = Vec::new();

                if let Some(ref active_db) = cur_db {
                    let use_query = format!("USE {}", quote_mysql_identifier(active_db));
                    let _ = sqlx::query(&use_query).execute(&pool).await;

                    let t_rows: Vec<(String, String)> = sqlx::query_as("SHOW FULL TABLES")
                        .fetch_all(&pool)
                        .await
                        .unwrap_or_default();

                    let col_rows: Vec<(String, String, String, String, Option<String>)> = sqlx::query_as(
                        "SELECT table_name, column_name, column_type, is_nullable, column_default
                         FROM information_schema.COLUMNS
                         WHERE table_schema = ?
                         ORDER BY table_name, ordinal_position",
                    )
                    .bind(active_db)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();
                    let pk_rows: Vec<(String, String)> = sqlx::query_as(
                        "SELECT table_name, column_name
                         FROM information_schema.KEY_COLUMN_USAGE
                         WHERE table_schema = ? AND constraint_name = 'PRIMARY'",
                    )
                    .bind(active_db)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();
                    let pk_columns: HashSet<(String, String)> =
                        pk_rows.into_iter().collect();
                    let mut columns_by_table: HashMap<String, Vec<DbColumnMeta>> = HashMap::new();

                    for (table_name, column_name, data_type, is_nullable, default_value) in col_rows {
                        let is_primary_key = pk_columns.contains(&(table_name.clone(), column_name.clone()));
                        columns_by_table
                            .entry(table_name)
                            .or_default()
                            .push(DbColumnMeta {
                                name: column_name,
                                data_type,
                                is_nullable: is_nullable == "YES",
                                is_primary_key,
                                default_value,
                            });
                    }

                    for (table_name, table_kind) in t_rows {
                        tables.push(DbTableMeta {
                            columns: columns_by_table.remove(&table_name).unwrap_or_default(),
                            name: table_name,
                            schema: Some(active_db.clone()),
                            table_type: if table_kind.contains("VIEW") {
                                "VIEW".to_string()
                            } else {
                                "TABLE".to_string()
                            },
                            row_count: None,
                        });
                    }
                }

                Ok(DbSchemaOverview {
                    databases,
                    current_database: cur_db,
                    tables,
                })
            }
            "postgres" | "postgresql" => {
                let mut cfg = config.clone();
                if let Some(ref db) = selected_db {
                    cfg.database = Some(db.clone());
                }
                let url = Self::build_pg_url(&cfg);
                let pool = self.pg_pool(&url).await?;

                let db_rows: Vec<(String,)> = sqlx::query_as(
                    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
                )
                .fetch_all(&pool)
                .await
                .unwrap_or_default();
                let databases: Vec<String> = db_rows.into_iter().map(|r| r.0).collect();

                let cur_db = cfg.database.clone().or_else(|| databases.first().cloned());
                let mut tables = Vec::new();

                let metadata_rows: Vec<(
                    String,
                    String,
                    String,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    Option<String>,
                    bool,
                )> = sqlx::query_as(
                    "SELECT t.table_schema,
                            t.table_name,
                            t.table_type,
                            c.column_name,
                            c.data_type,
                            c.is_nullable,
                            c.column_default,
                            EXISTS (
                                SELECT 1
                                FROM information_schema.table_constraints tc
                                JOIN information_schema.key_column_usage kcu
                                  ON tc.constraint_catalog = kcu.constraint_catalog
                                 AND tc.constraint_schema = kcu.constraint_schema
                                 AND tc.constraint_name = kcu.constraint_name
                                WHERE tc.constraint_type = 'PRIMARY KEY'
                                  AND tc.table_schema = t.table_schema
                                  AND tc.table_name = t.table_name
                                  AND kcu.column_name = c.column_name
                            ) AS is_primary_key
                     FROM information_schema.tables t
                     LEFT JOIN information_schema.columns c
                       ON c.table_schema = t.table_schema
                      AND c.table_name = t.table_name
                     WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
                     ORDER BY t.table_name, t.table_schema, c.ordinal_position",
                )
                .fetch_all(&pool)
                .await
                .unwrap_or_default();
                let mut table_indexes: HashMap<String, usize> = HashMap::new();

                for (
                    schema_name,
                    table_name,
                    table_kind,
                    column_name,
                    data_type,
                    is_nullable,
                    default_value,
                    is_primary_key,
                ) in metadata_rows
                {
                    let table_key = format!("{}\0{}", schema_name, table_name);
                    let table_index = match table_indexes.get(&table_key) {
                        Some(index) => *index,
                        None => {
                            let index = tables.len();
                            table_indexes.insert(table_key, index);
                            tables.push(DbTableMeta {
                                name: table_name.clone(),
                                schema: Some(schema_name),
                                table_type: if table_kind.contains("VIEW") {
                                    "VIEW".to_string()
                                } else {
                                    "TABLE".to_string()
                                },
                                row_count: None,
                                columns: Vec::new(),
                            });
                            index
                        }
                    };

                    if let (Some(column_name), Some(data_type), Some(is_nullable)) =
                        (column_name, data_type, is_nullable)
                    {
                        tables[table_index].columns.push(DbColumnMeta {
                            name: column_name,
                            data_type,
                            is_nullable: is_nullable == "YES" && !is_primary_key,
                            is_primary_key,
                            default_value,
                        });
                    }
                }

                Ok(DbSchemaOverview {
                    databases,
                    current_database: cur_db,
                    tables,
                })
            }
            "sqlite" => {
                let path = config
                    .sqlite_path
                    .as_deref()
                    .ok_or_else(|| "Path SQLite belum ditentukan".to_string())?;
                let url = format!("sqlite://{}", path);
                let pool = self.sqlite_pool(&url).await?;

                let metadata_rows = fetch_sqlite_metadata(&pool).await.unwrap_or_default();
                let mut table_indexes: HashMap<String, usize> = HashMap::new();
                let mut tables = Vec::new();

                for (table_name, table_kind, column_name, data_type, not_null, pk, default_value) in
                    metadata_rows
                {
                    let table_index = match table_indexes.get(&table_name) {
                        Some(index) => *index,
                        None => {
                            let index = tables.len();
                            table_indexes.insert(table_name.clone(), index);
                            tables.push(DbTableMeta {
                                name: table_name,
                                schema: None,
                                table_type: if table_kind == "view" {
                                    "VIEW".to_string()
                                } else {
                                    "TABLE".to_string()
                                },
                                row_count: None,
                                columns: Vec::new(),
                            });
                            index
                        }
                    };

                    tables[table_index].columns.push(DbColumnMeta {
                        name: column_name,
                        data_type,
                        is_nullable: not_null == 0,
                        is_primary_key: pk > 0,
                        default_value,
                    });
                }

                Ok(DbSchemaOverview {
                    databases: vec!["main".to_string()],
                    current_database: Some("main".to_string()),
                    tables,
                })
            }
            "redis" => {
                let url = Self::build_redis_url(config);
                let client = redis::Client::open(url).map_err(|e| format!("Redis Client error: {}", e))?;
                let mut conn = client
                    .get_multiplexed_async_connection()
                    .await
                    .map_err(|e| format!("Redis connection failed: {}", e))?;

                let keys = Self::scan_keys(&mut conn, 200).await?;

                let mut tables = Vec::new();
                for k in keys {
                    let k_type: String = redis::cmd("TYPE")
                        .arg(&k)
                        .query_async(&mut conn)
                        .await
                        .unwrap_or_else(|_| "string".to_string());

                    tables.push(DbTableMeta {
                        name: k,
                        schema: None,
                        table_type: k_type.to_uppercase(),
                        row_count: None,
                        columns: vec![
                            DbColumnMeta {
                                name: "key".to_string(),
                                data_type: "string".to_string(),
                                is_nullable: false,
                                is_primary_key: true,
                                default_value: None,
                            },
                            DbColumnMeta {
                                name: "value".to_string(),
                                data_type: "any".to_string(),
                                is_nullable: true,
                                is_primary_key: false,
                                default_value: None,
                            },
                        ],
                    });
                }

                let dbs = (0..16).map(|i| format!("db{}", i)).collect();

                Ok(DbSchemaOverview {
                    databases: dbs,
                    current_database: Some("db0".to_string()),
                    tables,
                })
            }
            "mongodb" => Err(MONGO_UNSUPPORTED_SCHEMA.to_string()),
            other => Err(format!("Engine {} tidak didukung", other)),
        }
    }

    pub async fn execute_query(
        &self,
        config: &DbConnectionConfig,
        selected_db: Option<String>,
        query: &str,
    ) -> Result<Vec<DbQueryResult>, String> {
        let statements = split_sql_statements(query);
        if statements.is_empty() {
            return Ok(vec![]);
        }

        let mut results = Vec::new();

        match config.engine.to_lowercase().as_str() {
            "mysql" | "mariadb" => {
                let mut cfg = config.clone();
                if let Some(ref db) = selected_db {
                    cfg.database = Some(db.clone());
                }
                let url = Self::build_mysql_url(&cfg);
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("MySQL connection error: {}", e))?;

                if let Some(ref db) = cfg.database {
                    let _ = sqlx::query(&format!("USE `{}`", db)).execute(&pool).await;
                }

                for stmt in statements {
                    let start = Instant::now();
                    let trimmed = stmt.trim();
                    let is_select = trimmed.to_uppercase().starts_with("SELECT")
                        || trimmed.to_uppercase().starts_with("SHOW")
                        || trimmed.to_uppercase().starts_with("DESCRIBE")
                        || trimmed.to_uppercase().starts_with("EXPLAIN");

                    if is_select {
                        use sqlx::Row;
                        let rows = sqlx::query(trimmed)
                            .fetch_all(&pool)
                            .await
                            .map_err(|e| format!("Query error on '{}': {}", trimmed, e))?;

                        let execution_time_ms = start.elapsed().as_millis() as u64;

                        if rows.is_empty() {
                            results.push(DbQueryResult {
                                statement: Some(trimmed.to_string()),
                                columns: vec![],
                                rows: vec![],
                                affected_rows: 0,
                                execution_time_ms,
                                error: None,
                            });
                            continue;
                        }

                        use sqlx::Column;
                        let first_row = &rows[0];
                        let columns: Vec<String> = first_row.columns().iter().map(|c| c.name().to_string()).collect();

                        let mut json_rows = Vec::new();
                        for r in rows {
                            let mut row_vals = Vec::new();
                            for (idx, _col) in r.columns().iter().enumerate() {
                                let val: Value = if let Ok(s) = r.try_get::<String, _>(idx) {
                                    Value::String(s)
                                } else if let Ok(dt) = r.try_get::<chrono::NaiveDateTime, _>(idx) {
                                    Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                                } else if let Ok(dt) = r.try_get::<chrono::DateTime<chrono::Utc>, _>(idx) {
                                    Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                                } else if let Ok(d) = r.try_get::<chrono::NaiveDate, _>(idx) {
                                    Value::String(d.format("%Y-%m-%d").to_string())
                                } else if let Ok(t) = r.try_get::<chrono::NaiveTime, _>(idx) {
                                    Value::String(t.format("%H:%M:%S").to_string())
                                } else if let Ok(i) = r.try_get::<i64, _>(idx) {
                                    Value::Number(i.into())
                                } else if let Ok(i) = r.try_get::<i32, _>(idx) {
                                    Value::Number(i.into())
                                } else if let Ok(u) = r.try_get::<u64, _>(idx) {
                                    Value::Number(u.into())
                                } else if let Ok(f) = r.try_get::<f64, _>(idx) {
                                    serde_json::Number::from_f64(f)
                                        .map(Value::Number)
                                        .unwrap_or(Value::Null)
                                } else if let Ok(b) = r.try_get::<bool, _>(idx) {
                                    Value::Bool(b)
                                } else if let Ok(json_v) = r.try_get::<serde_json::Value, _>(idx) {
                                    json_v
                                } else if let Ok(bytes) = r.try_get::<Vec<u8>, _>(idx) {
                                    Value::String(String::from_utf8_lossy(&bytes).to_string())
                                } else {
                                    Value::Null
                                };
                                row_vals.push(val);
                            }
                            json_rows.push(row_vals);
                        }

                        results.push(DbQueryResult {
                            statement: Some(trimmed.to_string()),
                            columns,
                            rows: json_rows,
                            affected_rows: 0,
                            execution_time_ms,
                            error: None,
                        });
                    } else {
                        let res = sqlx::query(trimmed)
                            .execute(&pool)
                            .await
                            .map_err(|e| format!("Execution error on '{}': {}", trimmed, e))?;

                        let execution_time_ms = start.elapsed().as_millis() as u64;

                        results.push(DbQueryResult {
                            statement: Some(trimmed.to_string()),
                            columns: vec![],
                            rows: vec![],
                            affected_rows: res.rows_affected(),
                            execution_time_ms,
                            error: None,
                        });
                    }
                }

                pool.close().await;
                Ok(results)
            }
            "postgres" | "postgresql" => {
                let mut cfg = config.clone();
                if let Some(ref db) = selected_db {
                    cfg.database = Some(db.clone());
                }
                let url = Self::build_pg_url(&cfg);
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("PostgreSQL connection error: {}", e))?;

                for stmt in statements {
                    let start = Instant::now();
                    let trimmed = stmt.trim();
                    let is_select = trimmed.to_uppercase().starts_with("SELECT")
                        || trimmed.to_uppercase().starts_with("SHOW")
                        || trimmed.to_uppercase().starts_with("EXPLAIN")
                        || trimmed.to_uppercase().starts_with("WITH");

                    if is_select {
                        use sqlx::Row;
                        let rows = sqlx::query(trimmed)
                            .fetch_all(&pool)
                            .await
                            .map_err(|e| format!("Query error on '{}': {}", trimmed, e))?;

                        let execution_time_ms = start.elapsed().as_millis() as u64;

                        if rows.is_empty() {
                            results.push(DbQueryResult {
                                statement: Some(trimmed.to_string()),
                                columns: vec![],
                                rows: vec![],
                                affected_rows: 0,
                                execution_time_ms,
                                error: None,
                            });
                            continue;
                        }

                        use sqlx::Column;
                        let first_row = &rows[0];
                        let columns: Vec<String> = first_row.columns().iter().map(|c| c.name().to_string()).collect();

                        let mut json_rows = Vec::new();
                        for r in rows {
                            let mut row_vals = Vec::new();
                            for (idx, _col) in r.columns().iter().enumerate() {
                                let val: Value = if let Ok(s) = r.try_get::<String, _>(idx) {
                                    Value::String(s)
                                } else if let Ok(dt) = r.try_get::<chrono::DateTime<chrono::Utc>, _>(idx) {
                                    Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                                } else if let Ok(dt) = r.try_get::<chrono::NaiveDateTime, _>(idx) {
                                    Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                                } else if let Ok(d) = r.try_get::<chrono::NaiveDate, _>(idx) {
                                    Value::String(d.format("%Y-%m-%d").to_string())
                                } else if let Ok(t) = r.try_get::<chrono::NaiveTime, _>(idx) {
                                    Value::String(t.format("%H:%M:%S").to_string())
                                } else if let Ok(u) = r.try_get::<uuid::Uuid, _>(idx) {
                                    Value::String(u.to_string())
                                } else if let Ok(i) = r.try_get::<i64, _>(idx) {
                                    Value::Number(i.into())
                                } else if let Ok(i) = r.try_get::<i32, _>(idx) {
                                    Value::Number(i.into())
                                } else if let Ok(i) = r.try_get::<i16, _>(idx) {
                                    Value::Number(i.into())
                                } else if let Ok(f) = r.try_get::<f64, _>(idx) {
                                    serde_json::Number::from_f64(f)
                                        .map(Value::Number)
                                        .unwrap_or(Value::Null)
                                } else if let Ok(b) = r.try_get::<bool, _>(idx) {
                                    Value::Bool(b)
                                } else if let Ok(json_v) = r.try_get::<serde_json::Value, _>(idx) {
                                    json_v
                                } else if let Ok(bytes) = r.try_get::<Vec<u8>, _>(idx) {
                                    Value::String(String::from_utf8_lossy(&bytes).to_string())
                                } else {
                                    Value::Null
                                };
                                row_vals.push(val);
                            }
                            json_rows.push(row_vals);
                        }

                        results.push(DbQueryResult {
                            statement: Some(trimmed.to_string()),
                            columns,
                            rows: json_rows,
                            affected_rows: 0,
                            execution_time_ms,
                            error: None,
                        });
                    } else {
                        let res = sqlx::query(trimmed)
                            .execute(&pool)
                            .await
                            .map_err(|e| format!("Execution error on '{}': {}", trimmed, e))?;

                        let execution_time_ms = start.elapsed().as_millis() as u64;

                        results.push(DbQueryResult {
                            statement: Some(trimmed.to_string()),
                            columns: vec![],
                            rows: vec![],
                            affected_rows: res.rows_affected(),
                            execution_time_ms,
                            error: None,
                        });
                    }
                }

                pool.close().await;
                Ok(results)
            }
            "sqlite" => {
                let path = config
                    .sqlite_path
                    .as_deref()
                    .ok_or_else(|| "Path SQLite belum ditentukan".to_string())?;
                let url = format!("sqlite://{}", path);
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("SQLite connection error: {}", e))?;

                for stmt in statements {
                    let start = Instant::now();
                    let trimmed = stmt.trim();
                    let is_select = trimmed.to_uppercase().starts_with("SELECT")
                        || trimmed.to_uppercase().starts_with("PRAGMA")
                        || trimmed.to_uppercase().starts_with("EXPLAIN");

                    if is_select {
                        use sqlx::Row;
                        let rows = sqlx::query(trimmed)
                            .fetch_all(&pool)
                            .await
                            .map_err(|e| format!("Query error on '{}': {}", trimmed, e))?;

                        let execution_time_ms = start.elapsed().as_millis() as u64;

                        if rows.is_empty() {
                            results.push(DbQueryResult {
                                statement: Some(trimmed.to_string()),
                                columns: vec![],
                                rows: vec![],
                                affected_rows: 0,
                                execution_time_ms,
                                error: None,
                            });
                            continue;
                        }

                        use sqlx::Column;
                        let first_row = &rows[0];
                        let columns: Vec<String> = first_row.columns().iter().map(|c| c.name().to_string()).collect();

                        let mut json_rows = Vec::new();
                        for r in rows {
                            let mut row_vals = Vec::new();
                            for (idx, _col) in r.columns().iter().enumerate() {
                                let val: Value = if let Ok(s) = r.try_get::<String, _>(idx) {
                                    Value::String(s)
                                } else if let Ok(dt) = r.try_get::<chrono::NaiveDateTime, _>(idx) {
                                    Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                                } else if let Ok(dt) = r.try_get::<chrono::DateTime<chrono::Utc>, _>(idx) {
                                    Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                                } else if let Ok(d) = r.try_get::<chrono::NaiveDate, _>(idx) {
                                    Value::String(d.format("%Y-%m-%d").to_string())
                                } else if let Ok(i) = r.try_get::<i64, _>(idx) {
                                    Value::Number(i.into())
                                } else if let Ok(f) = r.try_get::<f64, _>(idx) {
                                    serde_json::Number::from_f64(f)
                                        .map(Value::Number)
                                        .unwrap_or(Value::Null)
                                } else if let Ok(b) = r.try_get::<bool, _>(idx) {
                                    Value::Bool(b)
                                } else if let Ok(bytes) = r.try_get::<Vec<u8>, _>(idx) {
                                    Value::String(String::from_utf8_lossy(&bytes).to_string())
                                } else {
                                    Value::Null
                                };
                                row_vals.push(val);
                            }
                            json_rows.push(row_vals);
                        }

                        results.push(DbQueryResult {
                            statement: Some(trimmed.to_string()),
                            columns,
                            rows: json_rows,
                            affected_rows: 0,
                            execution_time_ms,
                            error: None,
                        });
                    } else {
                        let res = sqlx::query(trimmed)
                            .execute(&pool)
                            .await
                            .map_err(|e| format!("Execution error on '{}': {}", trimmed, e))?;

                        let execution_time_ms = start.elapsed().as_millis() as u64;

                        results.push(DbQueryResult {
                            statement: Some(trimmed.to_string()),
                            columns: vec![],
                            rows: vec![],
                            affected_rows: res.rows_affected(),
                            execution_time_ms,
                            error: None,
                        });
                    }
                }

                pool.close().await;
                Ok(results)
            }
            "redis" => {
                let host = config.host.as_deref().unwrap_or("127.0.0.1");
                let port = config.port.unwrap_or(6379);
                let pass = config.password.as_deref().unwrap_or("");
                let url = if pass.is_empty() {
                    format!("redis://{}:{}", host, port)
                } else {
                    format!("redis://:{}@{}:{}", pass, host, port)
                };

                let client = redis::Client::open(url).map_err(|e| format!("Redis Client error: {}", e))?;
                let mut conn = client
                    .get_multiplexed_async_connection()
                    .await
                    .map_err(|e| format!("Redis connection failed: {}", e))?;

                for stmt in statements {
                    let start = Instant::now();
                    let trimmed = stmt.trim();
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.is_empty() {
                        continue;
                    }

                    let cmd_name = parts[0].to_uppercase();
                    let mut cmd = redis::cmd(&cmd_name);
                    for arg in &parts[1..] {
                        cmd.arg(*arg);
                    }

                    let raw_val: redis::Value = cmd
                        .query_async(&mut conn)
                        .await
                        .map_err(|e| format!("Redis command error on '{}': {}", trimmed, e))?;

                    let execution_time_ms = start.elapsed().as_millis() as u64;

                    fn redis_val_to_json(v: redis::Value) -> Value {
                        match v {
                            redis::Value::Nil => Value::Null,
                            redis::Value::Int(i) => Value::Number(i.into()),
                            redis::Value::BulkString(bytes) => {
                                Value::String(String::from_utf8_lossy(&bytes).to_string())
                            }
                            redis::Value::SimpleString(s) => Value::String(s),
                            redis::Value::Array(items) => {
                                Value::Array(items.into_iter().map(redis_val_to_json).collect())
                            }
                            redis::Value::Map(pairs) => {
                                let mut map = serde_json::Map::new();
                                for (k, val) in pairs {
                                    let key_str = match k {
                                        redis::Value::SimpleString(s) => s,
                                        redis::Value::BulkString(b) => String::from_utf8_lossy(&b).to_string(),
                                        other => format!("{:?}", other),
                                    };
                                    map.insert(key_str, redis_val_to_json(val));
                                }
                                Value::Object(map)
                            }
                            redis::Value::Set(items) => {
                                Value::Array(items.into_iter().map(redis_val_to_json).collect())
                            }
                            redis::Value::Double(f) => {
                                serde_json::Number::from_f64(f)
                                    .map(Value::Number)
                                    .unwrap_or(Value::Null)
                            }
                            redis::Value::Boolean(b) => Value::Bool(b),
                            redis::Value::VerbatimString { text, .. } => Value::String(text),
                            redis::Value::Okay => Value::String("OK".to_string()),
                            other => Value::String(format!("{:?}", other)),
                        }
                    }

                    let json_res = redis_val_to_json(raw_val);

                    results.push(DbQueryResult {
                        statement: Some(trimmed.to_string()),
                        columns: vec!["Result".to_string()],
                        rows: vec![vec![json_res]],
                        affected_rows: 0,
                        execution_time_ms,
                        error: None,
                    });
                }

                Ok(results)
            }
            "mongodb" => Err(MONGO_UNSUPPORTED_EXEC.to_string()),
            other => Err(format!("Engine {} tidak didukung", other)),
        }
    }

    pub async fn get_server_metrics(&self, config: &DbConnectionConfig) -> Result<DbServerMetrics, String> {
        match config.engine.to_lowercase().as_str() {
            "mysql" | "mariadb" => {
                let url = Self::build_mysql_url(config);
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("MySQL error: {}", e))?;

                let version_row: (String,) = sqlx::query_as("SELECT VERSION()")
                    .fetch_one(&pool)
                    .await
                    .unwrap_or_else(|_| ("Unknown".to_string(),));

                let status_rows: Vec<(String, String)> = sqlx::query_as("SHOW GLOBAL STATUS")
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                let var_rows: Vec<(String, String)> = sqlx::query_as("SHOW VARIABLES")
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                let mut status_map = HashMap::new();
                for (k, v) in status_rows {
                    status_map.insert(k, v);
                }

                let mut var_map = HashMap::new();
                for (k, v) in var_rows {
                    var_map.insert(k, v);
                }

                let uptime: u64 = status_map.get("Uptime").and_then(|v| v.parse().ok()).unwrap_or(0);
                let active_conn: i64 = status_map.get("Threads_connected").and_then(|v| v.parse().ok()).unwrap_or(1);
                let max_conn: i64 = var_map.get("max_connections").and_then(|v| v.parse().ok()).unwrap_or(151);
                let queries: i64 = status_map.get("Questions").and_then(|v| v.parse().ok()).unwrap_or(0);

                let read_req: f64 = status_map.get("Innodb_buffer_pool_read_requests").and_then(|v| v.parse().ok()).unwrap_or(1.0);
                let reads: f64 = status_map.get("Innodb_buffer_pool_reads").and_then(|v| v.parse().ok()).unwrap_or(0.0);
                let hit_rate = if read_req > 0.0 {
                    Some(100.0 - (reads * 100.0 / read_req))
                } else {
                    None
                };

                let mut extra = HashMap::new();
                if let Some(t_run) = status_map.get("Threads_running") {
                    extra.insert("Threads Running".to_string(), t_run.clone());
                }
                if let Some(open_t) = status_map.get("Open_tables") {
                    extra.insert("Open Tables".to_string(), open_t.clone());
                }
                if let Some(innodb_ver) = var_map.get("innodb_version") {
                    extra.insert("InnoDB Version".to_string(), innodb_ver.clone());
                }

                pool.close().await;

                Ok(DbServerMetrics {
                    engine: "MySQL".to_string(),
                    uptime_seconds: uptime,
                    version: version_row.0,
                    active_connections: active_conn,
                    max_connections: max_conn,
                    queries_count: queries,
                    memory_used_bytes: None,
                    memory_peak_bytes: None,
                    cache_hit_rate_pct: hit_rate,
                    extra_info: extra,
                })
            }
            "postgres" | "postgresql" => {
                let url = Self::build_pg_url(config);
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("PostgreSQL error: {}", e))?;

                let ver_row: (String,) = sqlx::query_as("SELECT VERSION()")
                    .fetch_one(&pool)
                    .await
                    .unwrap_or_else(|_| ("PostgreSQL".to_string(),));

                let conn_row: (i64,) = sqlx::query_as("SELECT count(*) FROM pg_stat_activity")
                    .fetch_one(&pool)
                    .await
                    .unwrap_or((1,));

                let max_row: (String,) = sqlx::query_as("SHOW max_connections")
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(("100".to_string(),));

                let uptime_row: (i64,) = sqlx::query_as(
                    "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::bigint, 0)",
                )
                .fetch_one(&pool)
                .await
                .unwrap_or((0,));

                let stats_row: Result<(Option<i64>, Option<f64>), _> = sqlx::query_as(
                    "SELECT sum(xact_commit + xact_rollback)::bigint, sum(blks_hit) * 100.0 / nullif(sum(blks_hit + blks_read), 0) FROM pg_stat_database",
                )
                .fetch_one(&pool)
                .await;

                let (queries_count, hit_rate) = match stats_row {
                    Ok((q, h)) => (q.unwrap_or(0), h),
                    Err(_) => (0, None),
                };

                pool.close().await;

                Ok(DbServerMetrics {
                    engine: "PostgreSQL".to_string(),
                    uptime_seconds: uptime_row.0 as u64,
                    version: ver_row.0,
                    active_connections: conn_row.0,
                    max_connections: max_row.0.parse().unwrap_or(100),
                    queries_count,
                    memory_used_bytes: None,
                    memory_peak_bytes: None,
                    cache_hit_rate_pct: hit_rate,
                    extra_info: HashMap::new(),
                })
            }
            "sqlite" => {
                let path = config.sqlite_path.as_deref().unwrap_or("");
                let file_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

                let url = format!("sqlite://{}", path);
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("SQLite error: {}", e))?;

                let ver_row: (String,) = sqlx::query_as("SELECT sqlite_version()")
                    .fetch_one(&pool)
                    .await
                    .unwrap_or_else(|_| ("3.0".to_string(),));

                let page_count: (i64,) = sqlx::query_as("PRAGMA page_count")
                    .fetch_one(&pool)
                    .await
                    .unwrap_or((0,));

                let page_size: (i64,) = sqlx::query_as("PRAGMA page_size")
                    .fetch_one(&pool)
                    .await
                    .unwrap_or((4096,));

                let mut extra = HashMap::new();
                extra.insert("Page Count".to_string(), page_count.0.to_string());
                extra.insert("Page Size".to_string(), format!("{} bytes", page_size.0));

                pool.close().await;

                Ok(DbServerMetrics {
                    engine: "SQLite".to_string(),
                    uptime_seconds: 0,
                    version: format!("SQLite v{}", ver_row.0),
                    active_connections: 1,
                    max_connections: 1,
                    queries_count: 0,
                    memory_used_bytes: Some(file_size),
                    memory_peak_bytes: None,
                    cache_hit_rate_pct: Some(100.0),
                    extra_info: extra,
                })
            }
            "redis" => {
                let host = config.host.as_deref().unwrap_or("127.0.0.1");
                let port = config.port.unwrap_or(6379);
                let pass = config.password.as_deref().unwrap_or("");
                let url = if pass.is_empty() {
                    format!("redis://{}:{}", host, port)
                } else {
                    format!("redis://:{}@{}:{}", pass, host, port)
                };

                let client = redis::Client::open(url).map_err(|e| format!("Redis error: {}", e))?;
                let mut conn = client
                    .get_multiplexed_async_connection()
                    .await
                    .map_err(|e| format!("Redis connection error: {}", e))?;

                let info_str: String = redis::cmd("INFO")
                    .query_async(&mut conn)
                    .await
                    .unwrap_or_default();

                let mut info_map = HashMap::new();
                for line in info_str.lines() {
                    if let Some((k, v)) = line.split_once(':') {
                        info_map.insert(k.trim().to_string(), v.trim().to_string());
                    }
                }

                let ver = info_map.get("redis_version").cloned().unwrap_or_else(|| "Redis".to_string());
                let uptime: u64 = info_map.get("uptime_in_seconds").and_then(|v| v.parse().ok()).unwrap_or(0);
                let clients: i64 = info_map.get("connected_clients").and_then(|v| v.parse().ok()).unwrap_or(1);
                let used_mem: u64 = info_map.get("used_memory").and_then(|v| v.parse().ok()).unwrap_or(0);
                let peak_mem: u64 = info_map.get("used_memory_peak").and_then(|v| v.parse().ok()).unwrap_or(0);
                let total_cmds: i64 = info_map.get("total_commands_processed").and_then(|v| v.parse().ok()).unwrap_or(0);

                let hits: f64 = info_map.get("keyspace_hits").and_then(|v| v.parse().ok()).unwrap_or(0.0);
                let misses: f64 = info_map.get("keyspace_misses").and_then(|v| v.parse().ok()).unwrap_or(0.0);
                let hit_rate = if (hits + misses) > 0.0 {
                    Some(hits * 100.0 / (hits + misses))
                } else {
                    None
                };

                let mut extra = HashMap::new();
                if let Some(r_mode) = info_map.get("redis_mode") {
                    extra.insert("Mode".to_string(), r_mode.clone());
                }
                if let Some(frag) = info_map.get("mem_fragmentation_ratio") {
                    extra.insert("Mem Frag Ratio".to_string(), frag.clone());
                }

                Ok(DbServerMetrics {
                    engine: "Redis".to_string(),
                    uptime_seconds: uptime,
                    version: ver,
                    active_connections: clients,
                    max_connections: 10000,
                    queries_count: total_cmds,
                    memory_used_bytes: Some(used_mem),
                    memory_peak_bytes: Some(peak_mem),
                    cache_hit_rate_pct: hit_rate,
                    extra_info: extra,
                })
            }
            other => Err(format!("Engine {} metrics tidak didukung", other)),
        }
    }

    pub async fn explain_query(
        &self,
        config: &DbConnectionConfig,
        selected_db: Option<String>,
        query: &str,
    ) -> Result<DbExplainResult, String> {
        let trimmed = query.trim();
        let engine = config.engine.to_lowercase();

        match engine.as_str() {
            "mysql" | "mariadb" => {
                let mut cfg = config.clone();
                if let Some(ref db) = selected_db {
                    cfg.database = Some(db.clone());
                }
                let url = Self::build_mysql_url(&cfg);
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("MySQL error: {}", e))?;

                if let Some(ref db) = cfg.database {
                    let _ = sqlx::query(&format!("USE `{}`", db)).execute(&pool).await;
                }

                let explain_sql = format!("EXPLAIN {}", trimmed);
                let rows = sqlx::query(&explain_sql)
                    .fetch_all(&pool)
                    .await
                    .map_err(|e| format!("EXPLAIN failed: {}", e))?;

                let mut raw_lines = Vec::new();
                let mut has_full_scan = false;
                let mut warnings = Vec::new();
                let mut suggestions = Vec::new();

                use sqlx::Row;
                for r in rows {
                    let tbl: String = r.try_get("table").unwrap_or_default();
                    let select_type: String = r.try_get("type").unwrap_or_default();
                    let key: Option<String> = r.try_get("key").ok();
                    let rows_examined: Option<i64> = r.try_get("rows").ok();
                    let extra: String = r.try_get("Extra").unwrap_or_default();

                    raw_lines.push(format!(
                        "Table: {}, Type: {}, Key: {:?}, Rows: {:?}, Extra: {}",
                        tbl, select_type, key, rows_examined, extra
                    ));

                    if select_type.eq_ignore_ascii_case("ALL") {
                        has_full_scan = true;
                        warnings.push(format!("Tabel `{}` melakukan Full Table Scan (Type: ALL)", tbl));
                        suggestions.push(format!(
                            "Pertimbangkan menambahkan indeks pada kolom yang digunakan di klausa WHERE/JOIN tabel `{}`",
                            tbl
                        ));
                    }
                    if extra.contains("Using filesort") {
                        warnings.push(format!("Tabel `{}` menggunakan filesort untuk pengurutan", tbl));
                        suggestions.push("Buat indeks komposit yang mencakup kolom ORDER BY untuk menghindari filesort".to_string());
                    }
                    if extra.contains("Using temporary") {
                        warnings.push("Query membuat temporary table di memori/disk".to_string());
                    }
                }

                pool.close().await;

                Ok(DbExplainResult {
                    format: "text".to_string(),
                    raw_output: raw_lines.join("\n"),
                    warnings,
                    suggestions,
                    has_full_table_scan: has_full_scan,
                })
            }
            "postgres" | "postgresql" => {
                let mut cfg = config.clone();
                if let Some(ref db) = selected_db {
                    cfg.database = Some(db.clone());
                }
                let url = Self::build_pg_url(&cfg);
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("PostgreSQL error: {}", e))?;

                let explain_sql = format!("EXPLAIN (ANALYZE false, VERBOSE, COSTS) {}", trimmed);
                let rows: Vec<(String,)> = sqlx::query_as(&explain_sql)
                    .fetch_all(&pool)
                    .await
                    .map_err(|e| format!("EXPLAIN failed: {}", e))?;

                let raw_output = rows.into_iter().map(|r| r.0).collect::<Vec<_>>().join("\n");
                let mut warnings = Vec::new();
                let mut suggestions = Vec::new();
                let mut has_full_scan = false;

                if raw_output.contains("Seq Scan") {
                    has_full_scan = true;
                    warnings.push("Ditemukan 'Seq Scan' (Sequential Scan menyeluruh terhadap tabel)".to_string());
                    suggestions.push("Buat B-Tree Index pada kolom filter WHERE/JOIN untuk mempercepat eksekusi".to_string());
                }
                if raw_output.contains("Sort") && !raw_output.contains("Index Scan") {
                    warnings.push("Query membutuhkan operasi Sort tambahan".to_string());
                }

                pool.close().await;

                Ok(DbExplainResult {
                    format: "text".to_string(),
                    raw_output,
                    warnings,
                    suggestions,
                    has_full_table_scan: has_full_scan,
                })
            }
            "sqlite" => {
                let path = config.sqlite_path.as_deref().unwrap_or("");
                let url = format!("sqlite://{}", path);
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("SQLite error: {}", e))?;

                let explain_sql = format!("EXPLAIN QUERY PLAN {}", trimmed);
                let rows = sqlx::query(&explain_sql)
                    .fetch_all(&pool)
                    .await
                    .map_err(|e| format!("EXPLAIN failed: {}", e))?;

                let mut raw_lines = Vec::new();
                let mut warnings = Vec::new();
                let mut suggestions = Vec::new();
                let mut has_full_scan = false;

                use sqlx::Row;
                for r in rows {
                    let detail: String = r.try_get("detail").unwrap_or_default();
                    raw_lines.push(detail.clone());

                    if detail.contains("SCAN") && !detail.contains("USING INDEX") {
                        has_full_scan = true;
                        warnings.push(format!("Full Scan terdeteksi: {}", detail));
                        suggestions.push("Tambahkan Index pada tabel tersebut untuk menggantikan SCAN menjadi SEARCH".to_string());
                    }
                }

                pool.close().await;

                Ok(DbExplainResult {
                    format: "text".to_string(),
                    raw_output: raw_lines.join("\n"),
                    warnings,
                    suggestions,
                    has_full_table_scan: has_full_scan,
                })
            }
            other => Err(format!("EXPLAIN tidak didukung untuk engine {}", other)),
        }
    }

    pub async fn get_processlist(&self, config: &DbConnectionConfig) -> Result<Vec<DbProcessItem>, String> {
        match config.engine.to_lowercase().as_str() {
            "mysql" | "mariadb" => {
                let url = Self::build_mysql_url(config);
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("MySQL error: {}", e))?;

                let rows: Vec<(i64, String, String, Option<String>, String, i64, Option<String>, Option<String>)> = sqlx::query_as(
                    "SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO FROM information_schema.PROCESSLIST ORDER BY TIME DESC"
                )
                .fetch_all(&pool)
                .await
                .map_err(|e| format!("Processlist error: {}", e))?;

                pool.close().await;

                Ok(rows.into_iter().map(|(id, user, host, db, command, time_sec, state, info)| {
                    DbProcessItem {
                        id,
                        user,
                        host,
                        db,
                        command,
                        time_seconds: time_sec,
                        state,
                        info,
                    }
                }).collect())
            }
            "postgres" | "postgresql" => {
                let url = Self::build_pg_url(config);
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("PostgreSQL error: {}", e))?;

                let rows: Vec<(i32, Option<String>, Option<String>, Option<String>, Option<String>, Option<i64>, Option<String>, Option<String>)> = sqlx::query_as(
                    "SELECT pid, usename, client_addr::text, datname, state, COALESCE(EXTRACT(EPOCH FROM (now() - query_start))::bigint, 0), state, query FROM pg_stat_activity WHERE state IS NOT NULL ORDER BY query_start ASC"
                )
                .fetch_all(&pool)
                .await
                .map_err(|e| format!("Processlist error: {}", e))?;

                pool.close().await;

                Ok(rows.into_iter().map(|(pid, user, host, db, command, time_sec, state, info)| {
                    DbProcessItem {
                        id: pid as i64,
                        user: user.unwrap_or_else(|| "postgres".to_string()),
                        host: host.unwrap_or_else(|| "local".to_string()),
                        db,
                        command: command.unwrap_or_else(|| "active".to_string()),
                        time_seconds: time_sec.unwrap_or(0),
                        state,
                        info,
                    }
                }).collect())
            }
            other => Err(format!("Processlist tidak didukung untuk engine {}", other)),
        }
    }

    pub async fn kill_process(&self, config: &DbConnectionConfig, process_id: i64) -> Result<(), String> {
        match config.engine.to_lowercase().as_str() {
            "mysql" | "mariadb" => {
                let url = Self::build_mysql_url(config);
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("MySQL error: {}", e))?;

                sqlx::query(&format!("KILL CONNECTION {}", process_id))
                    .execute(&pool)
                    .await
                    .map_err(|e| format!("Kill failed: {}", e))?;

                pool.close().await;
                Ok(())
            }
            "postgres" | "postgresql" => {
                let url = Self::build_pg_url(config);
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("PostgreSQL error: {}", e))?;

                let res: (bool,) = sqlx::query_as("SELECT pg_terminate_backend($1)")
                    .bind(process_id as i32)
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| format!("Kill failed: {}", e))?;

                pool.close().await;
                if res.0 {
                    Ok(())
                } else {
                    Err("Gagal menghentikan process (permission denied atau PID tidak ditemukan)".to_string())
                }
            }
            other => Err(format!("Kill process tidak didukung untuk engine {}", other)),
        }
    }

    pub async fn get_foreign_keys(
        &self,
        config: &DbConnectionConfig,
        selected_db: Option<String>,
    ) -> Result<Vec<DbForeignKeyRelation>, String> {
        match config.engine.to_lowercase().as_str() {
            "mysql" | "mariadb" => {
                let mut cfg = config.clone();
                if let Some(ref db) = selected_db {
                    cfg.database = Some(db.clone());
                }
                let target_db = cfg.database.clone().unwrap_or_else(|| "".to_string());
                let url = Self::build_mysql_url(&cfg);
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("MySQL error: {}", e))?;

                let rows: Vec<(String, String, String, String, Option<String>)> = sqlx::query_as(
                    "SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME
                     FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = $1 AND REFERENCED_TABLE_NAME IS NOT NULL"
                )
                .bind(&target_db)
                .fetch_all(&pool)
                .await
                .unwrap_or_default();

                pool.close().await;

                Ok(rows.into_iter().map(|(ft, fc, tt, tc, cname)| DbForeignKeyRelation {
                    from_table: ft,
                    from_column: fc,
                    to_table: tt,
                    to_column: tc,
                    constraint_name: cname,
                }).collect())
            }
            "postgres" | "postgresql" => {
                let mut cfg = config.clone();
                if let Some(ref db) = selected_db {
                    cfg.database = Some(db.clone());
                }
                let url = Self::build_pg_url(&cfg);
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("PostgreSQL error: {}", e))?;

                let sql = "SELECT
                    tc.table_name AS from_table, 
                    kcu.column_name AS from_column, 
                    ccu.table_name AS to_table,
                    ccu.column_name AS to_column,
                    tc.constraint_name
                FROM information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')";

                let rows: Vec<(String, String, String, String, Option<String>)> = sqlx::query_as(sql)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                pool.close().await;

                Ok(rows.into_iter().map(|(ft, fc, tt, tc, cname)| DbForeignKeyRelation {
                    from_table: ft,
                    from_column: fc,
                    to_table: tt,
                    to_column: tc,
                    constraint_name: cname,
                }).collect())
            }
            "sqlite" => {
                let path = config.sqlite_path.as_deref().unwrap_or("");
                let url = format!("sqlite://{}", path);
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("SQLite error: {}", e))?;

                let tables: Vec<(String,)> = sqlx::query_as(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
                .fetch_all(&pool)
                .await
                .unwrap_or_default();

                let mut rels = Vec::new();
                for (t_name,) in tables {
                    let pragma_sql = format!("PRAGMA foreign_key_list(\"{}\")", t_name);
                    if let Ok(rows) = sqlx::query(&pragma_sql).fetch_all(&pool).await {
                        use sqlx::Row;
                        for r in rows {
                            let to_table: String = r.try_get("table").unwrap_or_default();
                            let from_col: String = r.try_get("from").unwrap_or_default();
                            let to_col: String = r.try_get("to").unwrap_or_default();
                            if !to_table.is_empty() {
                                rels.push(DbForeignKeyRelation {
                                    from_table: t_name.clone(),
                                    from_column: from_col,
                                    to_table,
                                    to_column: to_col,
                                    constraint_name: None,
                                });
                            }
                        }
                    }
                }

                pool.close().await;
                Ok(rels)
            }
            _ => Ok(vec![]),
        }
    }

    pub async fn get_database_users(&self, config: &DbConnectionConfig) -> Result<Vec<DbUserItem>, String> {
        match config.engine.to_lowercase().as_str() {
            "mysql" | "mariadb" => {
                let url = Self::build_mysql_url(config);
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("MySQL error: {}", e))?;

                let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
                    "SELECT User, Host, Super_priv FROM mysql.user ORDER BY User, Host"
                )
                .fetch_all(&pool)
                .await
                .map_err(|e| format!("Failed to read users: {}", e))?;

                pool.close().await;

                Ok(rows.into_iter().map(|(u, h, sp)| {
                    let is_super = sp.as_deref() == Some("Y");
                    DbUserItem {
                        username: u,
                        host: h,
                        privileges: if is_super { vec!["ALL PRIVILEGES".to_string()] } else { vec!["USAGE".to_string()] },
                        is_superuser: is_super,
                    }
                }).collect())
            }
            "postgres" | "postgresql" => {
                let url = Self::build_pg_url(config);
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("PostgreSQL error: {}", e))?;

                let rows: Vec<(String, bool, bool, bool)> = sqlx::query_as(
                    "SELECT rolname, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles ORDER BY rolname"
                )
                .fetch_all(&pool)
                .await
                .map_err(|e| format!("Failed to read pg roles: {}", e))?;

                pool.close().await;

                Ok(rows.into_iter().map(|(rname, is_super, can_create_role, can_create_db)| {
                    let mut privs = Vec::new();
                    if is_super { privs.push("SUPERUSER".to_string()); }
                    if can_create_role { privs.push("CREATEROLE".to_string()); }
                    if can_create_db { privs.push("CREATEDB".to_string()); }
                    if privs.is_empty() { privs.push("LOGIN".to_string()); }

                    DbUserItem {
                        username: rname,
                        host: "%".to_string(),
                        privileges: privs,
                        is_superuser: is_super,
                    }
                }).collect())
            }
            other => Err(format!("User management tidak didukung untuk engine {}", other)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(engine: &str) -> DbConnectionConfig {
        DbConnectionConfig {
            id: "t".to_string(),
            name: "t".to_string(),
            engine: engine.to_string(),
            host: Some("db.example.com".to_string()),
            port: None,
            username: Some("app_user".to_string()),
            password: Some("p@ss:w/rd#1".to_string()),
            database: Some("app db".to_string()),
            ssl: None,
            sqlite_path: None,
            is_remote_sqlite: None,
            ssh_tunnel_enabled: None,
            ssh_session_id: None,
        }
    }

    #[test]
    fn percent_encode_leaves_unreserved_alone() {
        assert_eq!(percent_encode("abcXYZ019-_.~"), "abcXYZ019-_.~");
    }

    #[test]
    fn quote_mysql_identifier_escapes_backticks() {
        assert_eq!(quote_mysql_identifier("users"), "`users`");
        assert_eq!(quote_mysql_identifier("odd`name"), "`odd``name`");
    }

    #[tokio::test]
    async fn sqlite_metadata_query_batches_tables_and_columns() {
        let pool = sqlx::sqlite::SqlitePool::connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite should connect");
        sqlx::query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
            .execute(&pool)
            .await
            .expect("table should be created");
        sqlx::query("CREATE VIEW active_users AS SELECT id, name FROM users")
            .execute(&pool)
            .await
            .expect("view should be created");

        let rows = fetch_sqlite_metadata(&pool)
            .await
            .expect("metadata query should succeed");
        assert!(rows.iter().any(|row| row.0 == "users" && row.2 == "id" && row.5 == 1));
        assert!(rows.iter().any(|row| row.0 == "active_users" && row.1 == "view"));
    }

    #[test]
    fn percent_encode_escapes_url_reserved_characters() {
        assert_eq!(percent_encode("p@ss:w/rd#1"), "p%40ss%3Aw%2Frd%231");
        assert_eq!(percent_encode("a b"), "a%20b");
        assert_eq!(percent_encode("?&=+%"), "%3F%26%3D%2B%25");
    }

    #[test]
    fn percent_encode_handles_multibyte_utf8() {
        assert_eq!(percent_encode("é"), "%C3%A9");
    }

    #[test]
    fn mysql_url_encodes_credentials_and_database() {
        let url = DbmsManager::build_mysql_url(&cfg("mysql"));
        assert_eq!(
            url,
            "mysql://app_user:p%40ss%3Aw%2Frd%231@db.example.com:3306/app%20db"
        );
    }

    #[test]
    fn pg_url_encodes_credentials_and_database() {
        let url = DbmsManager::build_pg_url(&cfg("postgres"));
        assert_eq!(
            url,
            "postgres://app_user:p%40ss%3Aw%2Frd%231@db.example.com:5432/app%20db"
        );
    }

    #[test]
    fn redis_url_encodes_password_only_when_present() {
        let mut c = cfg("redis");
        c.username = None;
        assert_eq!(
            DbmsManager::build_redis_url(&c),
            "redis://:p%40ss%3Aw%2Frd%231@db.example.com:6379"
        );

        c.password = None;
        assert_eq!(
            DbmsManager::build_redis_url(&c),
            "redis://db.example.com:6379"
        );
    }

    #[test]
    fn redis_url_supports_acl_username() {
        assert_eq!(
            DbmsManager::build_redis_url(&cfg("redis")),
            "redis://app_user:p%40ss%3Aw%2Frd%231@db.example.com:6379"
        );
    }

    #[test]
    fn split_sql_statements_ignores_semicolons_inside_literals_and_quotes() {
        assert_eq!(
            split_sql_statements("SELECT ';' FROM t; SELECT 2"),
            vec!["SELECT ';' FROM t", "SELECT 2"]
        );
        assert_eq!(
            split_sql_statements("SELECT `a;b` FROM t"),
            vec!["SELECT `a;b` FROM t"]
        );
        assert_eq!(
            split_sql_statements("SELECT \"a;b\" FROM t"),
            vec!["SELECT \"a;b\" FROM t"]
        );
    }

    #[tokio::test]
    async fn mongodb_execution_returns_explicit_unsupported_error() {
        let mgr = DbmsManager::new();
        let err = mgr
            .execute_query(&cfg("mongodb"), None, "db.users.find({})")
            .await
            .expect_err("mongodb execution must not report success");
        assert!(err.contains("MongoDB"));
    }

    #[tokio::test]
    async fn mongodb_schema_overview_returns_explicit_unsupported_error() {
        let mgr = DbmsManager::new();
        let err = mgr
            .get_schema_overview(&cfg("mongodb"), None)
            .await
            .expect_err("mongodb schema read must not fabricate databases");
        assert!(err.contains("MongoDB"));
    }
}
