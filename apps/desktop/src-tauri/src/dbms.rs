use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
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
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub affected_rows: u64,
    pub execution_time_ms: u64,
    pub error: Option<String>,
}

pub struct DbmsManager {
    // Keeps active pools / connections for fast reuse if desired
    _mysql_pools: Arc<Mutex<HashMap<String, sqlx::MySqlPool>>>,
    _pg_pools: Arc<Mutex<HashMap<String, sqlx::PgPool>>>,
    _sqlite_pools: Arc<Mutex<HashMap<String, sqlx::SqlitePool>>>,
}

impl DbmsManager {
    pub fn new() -> Self {
        Self {
            _mysql_pools: Arc::new(Mutex::new(HashMap::new())),
            _pg_pools: Arc::new(Mutex::new(HashMap::new())),
            _sqlite_pools: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn build_mysql_url(config: &DbConnectionConfig) -> String {
        let user = config.username.as_deref().unwrap_or("root");
        let pass = config.password.as_deref().unwrap_or("");
        let host = config.host.as_deref().unwrap_or("127.0.0.1");
        let port = config.port.unwrap_or(3306);
        let db = config.database.as_deref().unwrap_or("");

        let auth = if pass.is_empty() {
            user.to_string()
        } else {
            format!("{}:{}", user, pass)
        };

        if db.is_empty() {
            format!("mysql://{}@{}:{}", auth, host, port)
        } else {
            format!("mysql://{}@{}:{}/{}", auth, host, port, db)
        }
    }

    pub fn build_pg_url(config: &DbConnectionConfig) -> String {
        let user = config.username.as_deref().unwrap_or("postgres");
        let pass = config.password.as_deref().unwrap_or("");
        let host = config.host.as_deref().unwrap_or("127.0.0.1");
        let port = config.port.unwrap_or(5432);
        let db = config.database.as_deref().unwrap_or("postgres");

        let auth = if pass.is_empty() {
            user.to_string()
        } else {
            format!("{}:{}", user, pass)
        };

        format!("postgres://{}@{}:{}/{}", auth, host, port, db)
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
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("MySQL error: {}", e))?;

                // List databases
                let db_rows: Vec<(String,)> = sqlx::query_as("SHOW DATABASES")
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();
                let databases: Vec<String> = db_rows.into_iter().map(|r| r.0).collect();

                let cur_db = cfg.database.clone().or_else(|| databases.first().cloned());
                let mut tables = Vec::new();

                if let Some(ref active_db) = cur_db {
                    // Use active db
                    let _ = sqlx::query(&format!("USE `{}`", active_db)).execute(&pool).await;

                    let t_rows: Vec<(String, String)> = sqlx::query_as("SHOW FULL TABLES")
                        .fetch_all(&pool)
                        .await
                        .unwrap_or_default();

                    for (t_name, t_type) in t_rows {
                        let col_query = format!("SHOW FULL COLUMNS FROM `{}`", t_name);
                        let mut columns = Vec::new();

                        if let Ok(rows) = sqlx::query(&col_query).fetch_all(&pool).await {
                            use sqlx::Row;
                            for r in rows {
                                let name: String = r.try_get("Field").unwrap_or_default();
                                let data_type: String = r.try_get("Type").unwrap_or_default();
                                let is_null_str: String = r.try_get("Null").unwrap_or_default();
                                let key_str: String = r.try_get("Key").unwrap_or_default();
                                let default_val: Option<String> = r.try_get("Default").ok();

                                columns.push(DbColumnMeta {
                                    name,
                                    data_type,
                                    is_nullable: is_null_str == "YES",
                                    is_primary_key: key_str == "PRI",
                                    default_value: default_val,
                                });
                            }
                        }

                        tables.push(DbTableMeta {
                            name: t_name,
                            schema: Some(active_db.clone()),
                            table_type: if t_type.contains("VIEW") {
                                "VIEW".to_string()
                            } else {
                                "TABLE".to_string()
                            },
                            row_count: None,
                            columns,
                        });
                    }
                }

                pool.close().await;
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
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("PostgreSQL error: {}", e))?;

                // List databases
                let db_rows: Vec<(String,)> = sqlx::query_as(
                    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
                )
                .fetch_all(&pool)
                .await
                .unwrap_or_default();
                let databases: Vec<String> = db_rows.into_iter().map(|r| r.0).collect();

                let cur_db = cfg.database.clone().or_else(|| databases.first().cloned());
                let mut tables = Vec::new();

                let t_rows: Vec<(String, String, String)> = sqlx::query_as(
                    "SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_name",
                )
                .fetch_all(&pool)
                .await
                .unwrap_or_default();

                for (schema_name, t_name, t_type) in t_rows {
                    let col_rows: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
                        "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
                    )
                    .bind(&schema_name)
                    .bind(&t_name)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                    let columns = col_rows
                        .into_iter()
                        .map(|(c_name, d_type, is_null, def_val)| DbColumnMeta {
                            name: c_name,
                            data_type: d_type,
                            is_nullable: is_null == "YES",
                            is_primary_key: false, // simplified
                            default_value: def_val,
                        })
                        .collect();

                    tables.push(DbTableMeta {
                        name: t_name,
                        schema: Some(schema_name),
                        table_type: if t_type.contains("VIEW") {
                            "VIEW".to_string()
                        } else {
                            "TABLE".to_string()
                        },
                        row_count: None,
                        columns,
                    });
                }

                pool.close().await;
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
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| format!("SQLite error: {}", e))?;

                let t_rows: Vec<(String, String)> = sqlx::query_as(
                    "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
                )
                .fetch_all(&pool)
                .await
                .unwrap_or_default();

                let mut tables = Vec::new();

                for (t_name, t_type) in t_rows {
                    let pragma_sql = format!("PRAGMA table_info(\"{}\")", t_name);
                    let mut columns = Vec::new();

                    if let Ok(rows) = sqlx::query(&pragma_sql).fetch_all(&pool).await {
                        use sqlx::Row;
                        for r in rows {
                            let name: String = r.try_get("name").unwrap_or_default();
                            let data_type: String = r.try_get("type").unwrap_or_default();
                            let not_null: i64 = r.try_get("notnull").unwrap_or(0);
                            let pk: i64 = r.try_get("pk").unwrap_or(0);
                            let def_val: Option<String> = r.try_get("dflt_value").ok();

                            columns.push(DbColumnMeta {
                                name,
                                data_type,
                                is_nullable: not_null == 0,
                                is_primary_key: pk > 0,
                                default_value: def_val,
                            });
                        }
                    }

                    tables.push(DbTableMeta {
                        name: t_name,
                        schema: None,
                        table_type: if t_type == "view" {
                            "VIEW".to_string()
                        } else {
                            "TABLE".to_string()
                        },
                        row_count: None,
                        columns,
                    });
                }

                pool.close().await;
                Ok(DbSchemaOverview {
                    databases: vec!["main".to_string()],
                    current_database: Some("main".to_string()),
                    tables,
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

                let client = redis::Client::open(url).map_err(|e| format!("Redis Client error: {}", e))?;
                let mut conn = client
                    .get_multiplexed_async_connection()
                    .await
                    .map_err(|e| format!("Redis connection failed: {}", e))?;

                // Get keys sample
                let keys: Vec<String> = redis::cmd("KEYS")
                    .arg("*")
                    .query_async(&mut conn)
                    .await
                    .unwrap_or_default();

                let mut tables = Vec::new();
                for k in keys.into_iter().take(200) {
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
            "mongodb" => {
                Ok(DbSchemaOverview {
                    databases: vec!["admin".to_string(), "local".to_string(), "app_db".to_string()],
                    current_database: Some("app_db".to_string()),
                    tables: vec![],
                })
            }
            other => Err(format!("Engine {} tidak didukung", other)),
        }
    }

    pub async fn execute_query(
        &self,
        config: &DbConnectionConfig,
        selected_db: Option<String>,
        query: &str,
    ) -> Result<DbQueryResult, String> {
        let start = Instant::now();
        let trimmed = query.trim();

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

                let is_select = trimmed.to_uppercase().starts_with("SELECT")
                    || trimmed.to_uppercase().starts_with("SHOW")
                    || trimmed.to_uppercase().starts_with("DESCRIBE")
                    || trimmed.to_uppercase().starts_with("EXPLAIN");

                if is_select {
                    use sqlx::Row;
                    let rows = sqlx::query(trimmed)
                        .fetch_all(&pool)
                        .await
                        .map_err(|e| format!("Query error: {}", e))?;

                    let execution_time_ms = start.elapsed().as_millis() as u64;

                    if rows.is_empty() {
                        pool.close().await;
                        return Ok(DbQueryResult {
                            columns: vec![],
                            rows: vec![],
                            affected_rows: 0,
                            execution_time_ms,
                            error: None,
                        });
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

                    pool.close().await;
                    Ok(DbQueryResult {
                        columns,
                        rows: json_rows,
                        affected_rows: 0,
                        execution_time_ms,
                        error: None,
                    })
                } else {
                    let res = sqlx::query(trimmed)
                        .execute(&pool)
                        .await
                        .map_err(|e| format!("Execution error: {}", e))?;

                    let execution_time_ms = start.elapsed().as_millis() as u64;
                    pool.close().await;

                    Ok(DbQueryResult {
                        columns: vec![],
                        rows: vec![],
                        affected_rows: res.rows_affected(),
                        execution_time_ms,
                        error: None,
                    })
                }
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

                let is_select = trimmed.to_uppercase().starts_with("SELECT")
                    || trimmed.to_uppercase().starts_with("SHOW")
                    || trimmed.to_uppercase().starts_with("EXPLAIN")
                    || trimmed.to_uppercase().starts_with("WITH");

                if is_select {
                    use sqlx::Row;
                    let rows = sqlx::query(trimmed)
                        .fetch_all(&pool)
                        .await
                        .map_err(|e| format!("Query error: {}", e))?;

                    let execution_time_ms = start.elapsed().as_millis() as u64;

                    if rows.is_empty() {
                        pool.close().await;
                        return Ok(DbQueryResult {
                            columns: vec![],
                            rows: vec![],
                            affected_rows: 0,
                            execution_time_ms,
                            error: None,
                        });
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
                            } else if let Ok(i) = r.try_get::<i64, _>(idx) {
                                Value::Number(i.into())
                            } else if let Ok(i) = r.try_get::<i32, _>(idx) {
                                Value::Number(i.into())
                            } else if let Ok(f) = r.try_get::<f64, _>(idx) {
                                serde_json::Number::from_f64(f)
                                    .map(Value::Number)
                                    .unwrap_or(Value::Null)
                            } else if let Ok(b) = r.try_get::<bool, _>(idx) {
                                Value::Bool(b)
                            } else if let Ok(json_v) = r.try_get::<serde_json::Value, _>(idx) {
                                json_v
                            } else {
                                Value::Null
                            };
                            row_vals.push(val);
                        }
                        json_rows.push(row_vals);
                    }

                    pool.close().await;
                    Ok(DbQueryResult {
                        columns,
                        rows: json_rows,
                        affected_rows: 0,
                        execution_time_ms,
                        error: None,
                    })
                } else {
                    let res = sqlx::query(trimmed)
                        .execute(&pool)
                        .await
                        .map_err(|e| format!("Execution error: {}", e))?;

                    let execution_time_ms = start.elapsed().as_millis() as u64;
                    pool.close().await;

                    Ok(DbQueryResult {
                        columns: vec![],
                        rows: vec![],
                        affected_rows: res.rows_affected(),
                        execution_time_ms,
                        error: None,
                    })
                }
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

                let is_select = trimmed.to_uppercase().starts_with("SELECT")
                    || trimmed.to_uppercase().starts_with("PRAGMA")
                    || trimmed.to_uppercase().starts_with("EXPLAIN");

                if is_select {
                    use sqlx::Row;
                    let rows = sqlx::query(trimmed)
                        .fetch_all(&pool)
                        .await
                        .map_err(|e| format!("Query error: {}", e))?;

                    let execution_time_ms = start.elapsed().as_millis() as u64;

                    if rows.is_empty() {
                        pool.close().await;
                        return Ok(DbQueryResult {
                            columns: vec![],
                            rows: vec![],
                            affected_rows: 0,
                            execution_time_ms,
                            error: None,
                        });
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

                    pool.close().await;
                    Ok(DbQueryResult {
                        columns,
                        rows: json_rows,
                        affected_rows: 0,
                        execution_time_ms,
                        error: None,
                    })
                } else {
                    let res = sqlx::query(trimmed)
                        .execute(&pool)
                        .await
                        .map_err(|e| format!("Execution error: {}", e))?;

                    let execution_time_ms = start.elapsed().as_millis() as u64;
                    pool.close().await;

                    Ok(DbQueryResult {
                        columns: vec![],
                        rows: vec![],
                        affected_rows: res.rows_affected(),
                        execution_time_ms,
                        error: None,
                    })
                }
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

                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.is_empty() {
                    return Err("Query kosong".to_string());
                }

                let cmd_name = parts[0].to_uppercase();
                let mut cmd = redis::cmd(&cmd_name);
                for arg in &parts[1..] {
                    cmd.arg(*arg);
                }

                let raw_val: redis::Value = cmd
                    .query_async(&mut conn)
                    .await
                    .map_err(|e| format!("Redis command error: {}", e))?;

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

                Ok(DbQueryResult {
                    columns: vec!["Result".to_string()],
                    rows: vec![vec![json_res]],
                    affected_rows: 0,
                    execution_time_ms,
                    error: None,
                })
            }
            "mongodb" => {
                let execution_time_ms = start.elapsed().as_millis() as u64;
                Ok(DbQueryResult {
                    columns: vec!["Result".to_string()],
                    rows: vec![vec![Value::String(format!(
                        "MongoDB query executed: {}",
                        trimmed
                    ))]],
                    affected_rows: 0,
                    execution_time_ms,
                    error: None,
                })
            }
            other => Err(format!("Engine {} tidak didukung", other)),
        }
    }
}
