//! Limiteur de débit global (fonctionnalité « façon IDM », réglable à chaud).
//!
//! Implémentation par réservation de créneaux temporels : chaque `acquire(n)`
//! réserve le temps nécessaire pour `n` octets au débit courant, sans conserver
//! le verrou pendant l'attente. Cela borne le **débit moyen** global de tous les
//! transferts (HTTP mono-flux et segments parallèles) sans famine.
//!
//! Un débit de `0` signifie **illimité** (aucune attente). Le débit peut être
//! changé à tout moment depuis les paramètres.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// Limiteur de débit partageable (clone bon marché : état derrière `Arc`).
#[derive(Clone)]
pub struct RateLimiter {
    /// Débit cible en octets/seconde ; `0` = illimité.
    rate: Arc<AtomicU64>,
    /// Prochain créneau libre (sérialise l'ordonnancement entre tâches).
    next_free: Arc<Mutex<Instant>>,
}

impl RateLimiter {
    pub fn new(bytes_per_sec: u64) -> Self {
        Self {
            rate: Arc::new(AtomicU64::new(bytes_per_sec)),
            next_free: Arc::new(Mutex::new(Instant::now())),
        }
    }

    /// Limiteur sans restriction.
    pub fn unlimited() -> Self {
        Self::new(0)
    }

    /// Change le débit cible à chaud (octets/seconde ; `0` = illimité).
    pub fn set_limit(&self, bytes_per_sec: u64) {
        self.rate.store(bytes_per_sec, Ordering::SeqCst);
    }

    /// Débit cible courant (octets/seconde ; `0` = illimité).
    pub fn limit(&self) -> u64 {
        self.rate.load(Ordering::SeqCst)
    }

    /// Attend le temps nécessaire pour « consommer » `n` octets au débit courant.
    pub async fn acquire(&self, n: u64) {
        let rate = self.rate.load(Ordering::SeqCst);
        if rate == 0 || n == 0 {
            return;
        }

        let wait = {
            let mut next = self.next_free.lock().await;
            let now = Instant::now();
            // On ne réserve jamais dans le passé.
            let base = if *next > now { *next } else { now };
            let dur = Duration::from_secs_f64(n as f64 / rate as f64);
            *next = base + dur;
            base.saturating_duration_since(now)
        };

        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::unlimited()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn illimite_ne_bloque_pas() {
        let rl = RateLimiter::unlimited();
        let t = Instant::now();
        for _ in 0..100 {
            rl.acquire(1_000_000).await;
        }
        assert!(t.elapsed() < Duration::from_millis(50));
    }

    #[tokio::test]
    async fn borne_le_debit_moyen() {
        // 200 Ko/s, blocs de 20 Ko : chaque acquire attend que le créneau
        // précédent s'achève. Pour k blocs, l'attente totale ≈ (k-1)·(20/200) s.
        // 6 blocs → ≈ 5·0,1 = 0,5 s (le dernier créneau n'est pas attendu).
        let rl = RateLimiter::new(200_000);
        let t = Instant::now();
        for _ in 0..6 {
            rl.acquire(20_000).await;
        }
        let elapsed = t.elapsed();
        assert!(
            elapsed >= Duration::from_millis(400),
            "trop rapide : {elapsed:?}"
        );
        assert!(
            elapsed < Duration::from_millis(1500),
            "trop lent : {elapsed:?}"
        );
    }

    #[test]
    fn set_et_lecture_du_debit() {
        let rl = RateLimiter::unlimited();
        assert_eq!(rl.limit(), 0);
        rl.set_limit(512_000);
        assert_eq!(rl.limit(), 512_000);
    }
}
