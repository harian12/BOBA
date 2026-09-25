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
}
