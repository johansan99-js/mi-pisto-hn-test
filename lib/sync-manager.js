/**
 * lib/supabase-client.js
 * Cliente inicializado de Supabase
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('⚠️ Supabase no configurado. Sync en la nube deshabilitado.');
  console.warn('Agregar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local');
}

export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 2
        }
      }
    })
  : null;

/**
 * Enviar magic link (sin contraseña)
 */
export async function sendMagicLink(email) {
  if (!supabase) throw new Error('Supabase no está configurado');
  
  const { error } = await supabase.auth.signInWithOtp({ 
    email,
    options: {
      emailRedirectTo: window.location.origin + '/?authenticated=true'
    }
  });
  
  if (error) throw error;
  return { success: true, email };
}

/**
 * Confirmar magic link
 */
export async function confirmMagicLink(email, token) {
  if (!supabase) throw new Error('Supabase no está configurado');
  
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email'
  });
  
  if (error) throw error;
  return data;
}

/**
 * Logout
 */
export async function logout() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Obtener usuario actual
 */
export async function getCurrentUser() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

---

/**
 * lib/sync-manager.js
 * Gestor de sincronización multi-dispositivo con cifrado E2E
 */

import { supabase } from './supabase-client.js';
import { encryptPayload, decryptPayload } from './crypto.js';
import { db } from './indexeddb.js'; // Tu capa de BD local

export class SyncManager {
  constructor(userId, pin) {
    this.userId = userId;
    this.pin = pin;
    this.queue = [];
    this.syncing = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.backoffDelays = [1000, 2000, 4000]; // Exponential backoff en ms
  }

  /**
   * Registrar cambio local
   * 1. Guardar en IndexedDB (SIEMPRE — offline-first)
   * 2. Encolar para sincronización
   * 3. Intentar sync si hay conexión
   */
  async queueLocalChange(dataType, localData) {
    console.log(`📝 [Queue] ${dataType}`);
    
    // 1. Guardar localmente SIEMPRE
    try {
      await db.saveTransaction(dataType, localData);
    } catch (err) {
      console.error(`❌ [DB] No se pudo guardar ${dataType}:`, err.message);
      throw err; // Esto es crítico
    }

    // 2. Cifrar y encolar
    try {
      const encrypted = await encryptPayload(localData, this.pin);
      this.queue.push({ dataType, payload: encrypted });
      console.log(`🔐 [Crypto] ${dataType} encriptado para queue`);
    } catch (err) {
      console.error(`❌ [Crypto] No se pudo encriptar ${dataType}:`, err.message);
      // No lanzar — continuar offline, sync fallará después
    }

    // 3. Sync si está online
    if (navigator.onLine && this.queue.length > 0) {
      this.triggerSync();
    }
  }

  /**
   * Sincronizar cambios con la nube
   * - Reintenta 3 veces con exponential backoff
   * - Limpia queue en éxito
   * - Permite offline sin error
   */
  async triggerSync() {
    if (this.syncing || this.queue.length === 0 || !supabase) {
      return;
    }

    this.syncing = true;

    try {
      for (const item of this.queue) {
        const { error } = await supabase
          .from('encrypted_data')
          .upsert({
            user_id: this.userId,
            device_id: this.getDeviceId(),
            data_type: item.dataType,
            encrypted_payload: item.payload,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,device_id,data_type'
          });

        if (error) {
          console.error(`❌ [Sync] Upsert ${item.dataType}: ${error.message}`);
          throw error;
        }

        console.log(`✅ [Sync] ${item.dataType} → nube`);
      }

      // Éxito: limpiar queue y resetear reintentos
      this.queue = [];
      this.retryCount = 0;
      console.log('✅ [Sync] Completado');

    } catch (err) {
      console.warn(`⚠️ [Sync] Error (intento ${this.retryCount + 1}/3): ${err.message}`);

      // Reintento con backoff exponencial
      if (this.retryCount < this.maxRetries) {
        const delay = this.backoffDelays[this.retryCount];
        this.retryCount++;
        console.log(`⏳ [Sync] Reintentando en ${delay}ms...`);
        
        setTimeout(() => this.triggerSync(), delay);
      } else {
        console.error('❌ [Sync] Falló tras 3 reintentos');
        // Mostrar notificación al usuario aquí
        this.showSyncError(err);
      }
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Descargar datos de la nube
   * Útil cuando usuario cambia de dispositivo
   */
  async pullRemoteData(dataType) {
    if (!supabase) {
      console.warn('⚠️ [Pull] Supabase no configurado');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('encrypted_data')
        .select('encrypted_payload, updated_at')
        .eq('user_id', this.userId)
        .eq('data_type', dataType)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.warn(`⚠️ [Pull] No encontrado ${dataType}: ${error.message}`);
        return null;
      }

      if (!data) return null;

      // Descifrar con PIN del usuario
      try {
        const decrypted = await decryptPayload(data.encrypted_payload, this.pin);
        console.log(`✅ [Pull] ${dataType} descifrado desde nube`);
        return decrypted;
      } catch (err) {
        console.error(`❌ [Pull] No se pudo descifrar ${dataType}: ${err.message}`);
        return null;
      }

    } catch (err) {
      console.error(`❌ [Pull] Error: ${err.message}`);
      return null;
    }
  }

  /**
   * Resolver conflictos entre dispositivos
   * Estrategia: last-write-wins (timestamp más nuevo gana)
   */
  async resolveConflict(localData, remoteData) {
    const localTime = new Date(localData.updated_at || 0).getTime();
    const remoteTime = new Date(remoteData.updated_at || 0).getTime();

    if (remoteTime > localTime) {
      // Nube es más nueva
      console.log('🔀 [Conflict] Remote win (más reciente)');
      return { winner: 'remote', data: remoteData };
      
    } else if (localTime > remoteTime) {
      // Local es más nuevo
      console.log('🔀 [Conflict] Local win (más reciente)');
      return { winner: 'local', data: localData };
      
    } else {
      // Mismo timestamp — intentar merge
      console.log('🔀 [Conflict] Mismo timestamp — merge automático');
      return { 
        winner: 'merge', 
        data: this.mergeTransactions(localData, remoteData) 
      };
    }
  }

  /**
   * Merge inteligente de transacciones
   * Combina arrays sin duplicados (por ID o por monto+fecha)
   */
  mergeTransactions(local, remote) {
    if (!Array.isArray(local?.transactions) || !Array.isArray(remote?.transactions)) {
      // Si no son arrays, retornar remote (suponemos que es más completo)
      return remote;
    }

    const merged = new Map();

    // Agregar todas las transacciones
    const allTransactions = [...local.transactions, ...remote.transactions];
    
    for (const tx of allTransactions) {
      // Usar ID si existe, sino generar key de monto+fecha
      const key = tx.id || `${tx.amount}-${tx.date}`;
      
      if (!merged.has(key)) {
        merged.set(key, tx);
      }
    }

    return {
      ...remote, // Mantener estructura del remote
      transactions: Array.from(merged.values()),
      merged_at: new Date().toISOString(),
      merged_count: allTransactions.length - merged.size // Duplicados eliminados
    };
  }

  /**
   * Obtener o generar ID único del dispositivo
   */
  getDeviceId() {
    let id = localStorage.getItem('__mipiston_device_id__');
    if (!id) {
      // Generar UUID v4 (simple)
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      localStorage.setItem('__mipiston_device_id__', id);
      console.log(`📱 [Device] Nuevo ID: ${id}`);
    }
    return id;
  }

  /**
   * Mostrar notificación de error de sync al usuario
   */
  showSyncError(error) {
    if (typeof window !== 'undefined' && window.showNotification) {
      window.showNotification({
        type: 'error',
        title: 'Error en sincronización',
        message: 'No se pudieron subir los cambios a la nube. Reintentaremos automáticamente.'
      });
    }
  }

  /**
   * Limpiar queue (para testing)
   */
  clearQueue() {
    this.queue = [];
    console.log('🗑️ Queue limpiada');
  }

  /**
   * Obtener estado del sync
   */
  getStatus() {
    return {
      syncing: this.syncing,
      queueSize: this.queue.length,
      retries: this.retryCount,
      deviceId: this.getDeviceId()
    };
  }
}

/**
 * Factory para crear SyncManager con session
 */
export async function createSyncManager(pin) {
  // Aquí iría la lógica de obtener userId de session
  // Por ahora, ejemplo:
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Usuario no autenticado');
  }
  
  return new SyncManager(user.id, pin);
}
