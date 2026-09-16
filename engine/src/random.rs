use crate::{distributions, eval::Value};
pub fn hash(s: &str) -> u64 {
    s.bytes().fold(14695981039346656037, |n, b| {
        (n ^ b as u64).wrapping_mul(1099511628211)
    })
}
struct Random(u64);
impl Random {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        ((z ^ (z >> 31)) >> 11) as f64 / (1u64 << 53) as f64
    }
}
pub fn function(name: &str, args: &[Value], seed: u64) -> Option<Result<Value, String>> {
    if name != "random" && name != "shuffle" {
        return None;
    }
    Some((|| {
        let source = if matches!(args.first(), Some(Value::List(_) | Value::Distribution(..))) {
            args.first()
        } else {
            None
        };
        let rest = if source.is_some() { &args[1..] } else { args };
        if name == "shuffle" {
            let Some(Value::List(xs)) = source else {
                return Err("Use shuffle(list, optional seed).".into());
            };
            if rest.len() > 1 {
                return Err("Use shuffle(list, optional seed).".into());
            }
            let mut rng = Random(seed ^ hash(&format!("{name}{args:?}")));
            let mut out = xs.clone();
            for i in (1..out.len()).rev() {
                let j = (rng.next() * (i + 1) as f64) as usize;
                out.swap(i, j);
            }
            return Ok(Value::List(out));
        }
        if rest.len() > 2 {
            return Err("Use random(optional count, optional seed).".into());
        }
        let count = if let Some(n) = rest.first() {
            n.scalar()?
        } else {
            1.
        };
        if !count.is_finite() || count < 0. || count.fract() != 0. || count > 10000. {
            return Err("The sample count must be an integer from 0 to 10,000.".into());
        }
        if let Some(seed) = rest.get(1) {
            if !seed.scalar()?.is_finite() {
                return Err("Use a finite seed.".into());
            }
        }
        let mut rng = Random(seed ^ hash(&format!("{name}{args:?}")));
        let mut out = vec![];
        for _ in 0..count as usize {
            let u = rng.next();
            out.push(match source {
                Some(Value::List(xs)) => xs
                    .get((u * xs.len() as f64) as usize)
                    .cloned()
                    .unwrap_or(Value::Scalar(f64::NAN)),
                Some(Value::Distribution(kind, p)) => Value::Scalar(distributions::evaluate(
                    kind,
                    p,
                    "inversecdf",
                    u.clamp(f64::EPSILON, 1. - f64::EPSILON),
                )?),
                _ => Value::Scalar(u),
            });
        }
        Ok(if rest.is_empty() {
            out.pop().unwrap_or(Value::Scalar(f64::NAN))
        } else {
            Value::List(out)
        })
    })())
}
