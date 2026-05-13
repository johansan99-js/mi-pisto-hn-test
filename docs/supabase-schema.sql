-- ============================================================
-- Mi Pisto HN — Supabase Schema (PostgreSQL)
-- ============================================================
-- 
-- Ejecutar en SQL Editor de Supabase para crear:
-- - Tablas con Row Level Security (RLS)
-- - Políticas para privacidad usuario-a-usuario
-- - Índices para rendimiento
--
-- ============================================================

-- 1. Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLA: encrypted_data
-- Almacena blobs cifrados de datos del usuario
-- Cada registro es independiente por (user_id, device_id, data_type)
-- ============================================================

CREATE TABLE encrypted_data (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Referencia al usuario (de auth.users)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Identificador único del dispositivo (generado por cliente)
  -- Permite saber de dónde vinieron los datos (celular, laptop, etc.)
  device_id text NOT NULL,
  
  -- Tipo de dato: transactions, settings, goals, debts, loans
  data_type text NOT NULL CHECK (
    data_type IN ('transactions', 'settings', 'goals', 'debts', 'loans')
  ),
  
  -- BLOB cifrado con AES-256-GCM
  -- Estructura: { ciphertext: number[], iv: number[], salt: number[], timestamp: string }
  encrypted_payload jsonb NOT NULL,
  
  -- Versión del esquema (para migraciones futuras)
  version integer DEFAULT 1,
  
  -- Timestamps
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  
  -- Restricción: un usuario solo puede tener UN registro por (device_id, data_type)
  UNIQUE(user_id, device_id, data_type)
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE encrypted_data ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS
-- Solo el propietario puede LEER sus datos
CREATE POLICY "select_own_encrypted_data"
  ON encrypted_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- Solo el propietario puede INSERTAR
CREATE POLICY "insert_own_encrypted_data"
  ON encrypted_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Solo el propietario puede ACTUALIZAR
CREATE POLICY "update_own_encrypted_data"
  ON encrypted_data
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Solo el propietario puede ELIMINAR
CREATE POLICY "delete_own_encrypted_data"
  ON encrypted_data
  FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Índices para rendimiento
-- Búsqueda por usuario + tipo de dato
CREATE INDEX idx_encrypted_data_user_type 
  ON encrypted_data(user_id, data_type);

-- Búsqueda por dispositivo (para pull remoto)
CREATE INDEX idx_encrypted_data_user_device 
  ON encrypted_data(user_id, device_id);

-- Búsqueda por timestamp (para sincronización incremental)
CREATE INDEX idx_encrypted_data_updated 
  ON encrypted_data(user_id, updated_at DESC);

-- 5. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_encrypted_data_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_encrypted_data_updated
  BEFORE UPDATE ON encrypted_data
  FOR EACH ROW
  EXECUTE FUNCTION update_encrypted_data_timestamp();

-- ============================================================
-- TABLA: sync_log (OPCIONAL)
-- Historial de sincronización para debugging
-- ============================================================

CREATE TABLE sync_log (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  
  -- Acción: 'push', 'pull', 'conflict', 'merge', 'error'
  action text NOT NULL,
  data_type text,
  
  -- Detalles en JSON (flexible para diferentes acciones)
  details jsonb,
  
  timestamp timestamptz DEFAULT now() NOT NULL
);

-- Índice para búsqueda rápida
CREATE INDEX idx_sync_log_user_time 
  ON sync_log(user_id, timestamp DESC);

-- RLS para sync_log
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_sync_log"
  ON sync_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "insert_own_sync_log"
  ON sync_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- FUNCIÓN: get_sync_status
-- Útil para CLI/dashboard
-- ============================================================

CREATE OR REPLACE FUNCTION get_sync_status(p_user_id uuid)
RETURNS TABLE (
  total_records bigint,
  last_sync timestamptz,
  devices_count int,
  pending_syncs int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_records,
    MAX(ed.updated_at) as last_sync,
    COUNT(DISTINCT ed.device_id)::int as devices_count,
    COUNT(DISTINCT CASE WHEN ed.updated_at > NOW() - INTERVAL '1 hour' THEN ed.id END)::int as pending_syncs
  FROM encrypted_data ed
  WHERE ed.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VISTAS: para monitoreo (OPCIONAL)
-- ============================================================

CREATE VIEW v_user_sync_summary AS
SELECT 
  ed.user_id,
  COUNT(*) as total_records,
  COUNT(DISTINCT ed.device_id) as device_count,
  COUNT(DISTINCT ed.data_type) as data_type_count,
  MAX(ed.updated_at) as last_update,
  (NOW() - MAX(ed.updated_at)) as time_since_update
FROM encrypted_data ed
GROUP BY ed.user_id;

-- ============================================================
-- COMENTARIOS (Documentación en BD)
-- ============================================================

COMMENT ON TABLE encrypted_data IS 
'Almacena datos cifrados de usuarios con AES-256-GCM. Cada registro es independiente. La privacidad se garantiza mediante RLS: solo el propietario puede acceder.';

COMMENT ON COLUMN encrypted_data.encrypted_payload IS 
'Objeto JSON con: { ciphertext: number[], iv: number[], salt: number[], timestamp: string }. El ciphertext es el resultado de AES-256-GCM.encrypt().';

COMMENT ON COLUMN encrypted_data.device_id IS 
'Identificador único del dispositivo. Generado como UUID v4 en el cliente y almacenado en localStorage.';

COMMENT ON TABLE sync_log IS 
'Historial de operaciones de sincronización. Usada para debugging y auditoría. NO contiene datos sensibles (solo metadata).';

-- ============================================================
-- PERMISOS (para seguridad)
-- ============================================================

-- Revocar permisos públicos (solo usuarios autenticados pueden acceder)
REVOKE ALL ON encrypted_data FROM PUBLIC;
REVOKE ALL ON sync_log FROM PUBLIC;
REVOKE ALL ON v_user_sync_summary FROM PUBLIC;

-- Dar permisos a authenticated role (todos los usuarios autenticados)
GRANT SELECT ON encrypted_data TO authenticated;
GRANT INSERT ON encrypted_data TO authenticated;
GRANT UPDATE ON encrypted_data TO authenticated;
GRANT DELETE ON encrypted_data TO authenticated;

GRANT SELECT ON sync_log TO authenticated;
GRANT INSERT ON sync_log TO authenticated;

GRANT SELECT ON v_user_sync_summary TO authenticated;

-- ============================================================
-- INSTRUCCIONES DE USO
-- ============================================================
--
-- 1. Ejecutar este script completo en Supabase > SQL Editor
-- 2. Resultado: Tablas con RLS activo, índices, funciones
-- 3. Verificar:
--    SELECT * FROM information_schema.tables 
--    WHERE table_schema = 'public' AND table_name LIKE 'encrypted_%';
--
-- 4. En el cliente (JavaScript):
--    - Encriptar datos con AES-256-GCM (crypto.js)
--    - Supabase almacena solo el blob cifrado
--    - RLS garantiza que solo el propietario pueda acceder
--
-- 5. Monitoreo:
--    SELECT * FROM get_sync_status('user-id-aqui');
--
-- ============================================================
