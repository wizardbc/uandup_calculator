use crate::eval::Value;
use statrs::distribution::{
    Binomial, ChiSquared, Continuous, ContinuousCDF, Discrete, DiscreteCDF, Geometric, Normal,
    Poisson, StudentsT, Uniform,
};

pub fn evaluate(name: &str, p: &[f64], member: &str, x: f64) -> Result<f64, String> {
    if x.is_nan() {
        return Ok(f64::NAN);
    }
    if member == "inversecdf" && x == 1. && ["poissondist", "geodist"].contains(&name) {
        return Ok(f64::INFINITY);
    }
    let bad = || "Check the distribution parameters.".to_string();
    macro_rules! continuous {
        ($dist:expr) => {{
            let d = $dist.map_err(|_| bad())?;
            match member {
                "pdf" => d.pdf(x),
                "cdf" => d.cdf(x),
                "inversecdf" => {
                    if !(0. ..=1.).contains(&x) {
                        f64::NAN
                    } else {
                        d.inverse_cdf(x)
                    }
                }
                _ => f64::NAN,
            }
        }};
    }
    macro_rules! discrete {
        ($dist:expr) => {{
            let d = $dist.map_err(|_| bad())?;
            match member {
                "pdf" => {
                    if x < 0. || x.fract() != 0. {
                        0.
                    } else {
                        d.pmf(x as u64)
                    }
                }
                "cdf" => {
                    if x < 0. {
                        0.
                    } else if x == f64::INFINITY {
                        1.
                    } else {
                        d.cdf(x.floor() as u64)
                    }
                }
                "inversecdf" => {
                    if !(0. ..=1.).contains(&x) {
                        f64::NAN
                    } else {
                        d.inverse_cdf(x) as f64
                    }
                }
                _ => f64::NAN,
            }
        }};
    }
    let result = match name {
        "normaldist" => {
            if p.len() > 2 {
                return Err(bad());
            }
            continuous!(Normal::new(
                p.first().copied().unwrap_or(0.),
                p.get(1).copied().unwrap_or(1.)
            ))
        }
        "tdist" => {
            if p.len() != 1 {
                return Err(bad());
            }
            continuous!(StudentsT::new(0., 1., p[0]))
        }
        "chisqdist" => {
            if p.len() != 1 {
                return Err(bad());
            }
            continuous!(ChiSquared::new(p[0]))
        }
        "uniformdist" => {
            if p.len() > 2 {
                return Err(bad());
            }
            continuous!(Uniform::new(
                p.first().copied().unwrap_or(0.),
                p.get(1).copied().unwrap_or(1.)
            ))
        }
        "binomialdist" => {
            if p.is_empty() || p.len() > 2 || p[0] < 0. || p[0].fract() != 0. || p[0] > 1e6 {
                return Err(bad());
            }
            discrete!(Binomial::new(p.get(1).copied().unwrap_or(0.5), p[0] as u64))
        }
        "poissondist" => {
            if p.len() != 1 {
                return Err(bad());
            }
            discrete!(Poisson::new(p[0]))
        }
        "geodist" => {
            if p.len() != 1 {
                return Err(bad());
            }
            let d = Geometric::new(p[0]).map_err(|_| bad())?;
            match member {
                "pdf" => {
                    if x < 1. || x.fract() != 0. {
                        0.
                    } else {
                        d.pmf(x as u64)
                    }
                }
                "cdf" => {
                    if x < 1. {
                        0.
                    } else if x == f64::INFINITY {
                        1.
                    } else {
                        d.cdf(x.floor() as u64)
                    }
                }
                "inversecdf" => {
                    if !(0. ..=1.).contains(&x) {
                        f64::NAN
                    } else {
                        d.inverse_cdf(x) as f64
                    }
                }
                _ => f64::NAN,
            }
        }
        "discretedist" => {
            if p.is_empty() || p.len() % 2 != 0 {
                return Err(bad());
            }
            let total = p.chunks_exact(2).map(|p| p[1]).sum::<f64>();
            match member {
                "pdf" => {
                    p.chunks_exact(2)
                        .filter(|p| p[0] == x)
                        .map(|p| p[1])
                        .sum::<f64>()
                        / total
                }
                "cdf" => {
                    p.chunks_exact(2)
                        .filter(|p| p[0] <= x)
                        .map(|p| p[1])
                        .sum::<f64>()
                        / total
                }
                "inversecdf" => {
                    if !(0. ..=1.).contains(&x) {
                        f64::NAN
                    } else {
                        let mut pairs: Vec<_> = p.chunks_exact(2).filter(|p| p[1] > 0.).collect();
                        pairs.sort_by(|a, b| a[0].total_cmp(&b[0]));
                        let mut cumulative = 0.;
                        let mut value = pairs.last().ok_or_else(bad)?[0];
                        for pair in pairs {
                            cumulative += pair[1] / total;
                            if cumulative >= x {
                                value = pair[0];
                                break;
                            }
                        }
                        value
                    }
                }
                _ => f64::NAN,
            }
        }
        _ => return Err("Unknown distribution.".into()),
    };
    Ok(result)
}
pub fn member(name: &str, args: &[Value]) -> Result<Value, String> {
    let Some(Value::Distribution(kind, params)) = args.first() else {
        return Err("Use a distribution, such as normaldist(0,1).cdf(1).".into());
    };
    if name == "cdf" && args.len() == 3 {
        let low = args[1].scalar()?;
        let high = args[2].scalar()?;
        if kind == "discretedist" {
            let total: f64 = params.chunks_exact(2).map(|v| v[1]).sum();
            let selected: f64 = params
                .chunks_exact(2)
                .filter(|v| v[0] >= low && v[0] <= high)
                .map(|v| v[1])
                .sum();
            return Ok(Value::Scalar(selected / total));
        }
        let low = if ["binomialdist", "poissondist", "geodist"].contains(&kind.as_str()) {
            low.ceil() - 1.
        } else {
            low
        };
        return Ok(Value::Scalar(if high < low {
            0.
        } else {
            evaluate(kind, params, name, high)? - evaluate(kind, params, name, low)?
        }));
    }
    if args.len() != 2 {
        return Err("Enter one value, or two bounds for cdf.".into());
    }
    let apply = |x| evaluate(kind, params, name, x);
    match &args[1] {
        Value::Scalar(x) => Ok(Value::Scalar(apply(*x)?)),
        Value::List(xs) => Ok(Value::List(
            xs.iter()
                .map(|v| Ok(Value::Scalar(apply(v.scalar()?)?)))
                .collect::<Result<_, String>>()?,
        )),
        _ => Err("Use a number or a list.".into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn known_probabilities() {
        assert!((evaluate("normaldist", &[], "cdf", 0.).unwrap() - 0.5).abs() < 1e-14);
        let cdf = evaluate("normaldist", &[], "cdf", 1.959963984540054).unwrap();
        assert!((cdf - 0.975).abs() < 1e-9, "normal cdf: {cdf:.16}");
        assert!(
            (evaluate("binomialdist", &[10., 0.5], "pdf", 5.).unwrap() - 0.24609375).abs() < 1e-12
        );
        assert!(
            (evaluate("tdist", &[10.], "inversecdf", 0.975).unwrap() - 2.2281388519649385).abs()
                < 1e-8
        );
    }
}

pub fn moments(name: &str, p: &[f64]) -> Result<(f64, f64), String> {
    evaluate(name, p, "cdf", 0.)?;
    Ok(match name {
        "normaldist" => (
            p.first().copied().unwrap_or(0.),
            p.get(1).copied().unwrap_or(1.).powi(2),
        ),
        "uniformdist" => {
            let a = p.first().copied().unwrap_or(0.);
            let b = p.get(1).copied().unwrap_or(1.);
            ((a + b) / 2., (b - a).powi(2) / 12.)
        }
        "tdist" => (
            if p[0] > 1. { 0. } else { f64::NAN },
            if p[0] > 2. {
                p[0] / (p[0] - 2.)
            } else if p[0] > 1. {
                f64::INFINITY
            } else {
                f64::NAN
            },
        ),
        "chisqdist" => (p[0], 2. * p[0]),
        "binomialdist" => {
            let chance = p.get(1).copied().unwrap_or(0.5);
            (p[0] * chance, p[0] * chance * (1. - chance))
        }
        "poissondist" => (p[0], p[0]),
        "geodist" => (1. / p[0], (1. - p[0]) / p[0].powi(2)),
        "discretedist" => {
            let total = p.chunks_exact(2).map(|p| p[1]).sum::<f64>();
            let mean = p.chunks_exact(2).map(|p| p[0] * p[1]).sum::<f64>() / total;
            let variance = p
                .chunks_exact(2)
                .map(|p| (p[0] - mean).powi(2) * p[1])
                .sum::<f64>()
                / total;
            (mean, variance)
        }
        _ => return Err("Unknown distribution.".into()),
    })
}
pub fn function(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    if name == "discretedist" {
        return Some((|| {
            if args.is_empty() || args.len() > 2 {
                return Err("Use discretedist(values, optional weights).".into());
            }
            let xs = args[0].numbers()?;
            let weights = if args.len() == 2 {
                args[1].numbers()?
            } else {
                vec![1.; xs.len()]
            };
            if xs.is_empty()
                || xs.len() != weights.len()
                || xs.iter().any(|x| !x.is_finite())
                || weights.iter().any(|w| !w.is_finite() || *w < 0.)
                || weights.iter().sum::<f64>() <= 0.
            {
                return Err("Use equally sized lists of values and nonnegative weights with a positive total.".into());
            }
            let p = xs
                .into_iter()
                .zip(weights)
                .flat_map(|(x, w)| [x, w])
                .collect();
            Ok(Value::Distribution(name.into(), p))
        })());
    }
    let Some(Value::Distribution(kind, p)) = args.first() else {
        return None;
    };
    if ![
        "mean", "median", "stdev", "stdevp", "var", "varp", "variance", "quantile", "quartile",
    ]
    .contains(&name)
    {
        return None;
    }
    Some((|| {
        let (mean, var) = moments(kind, p)?;
        let q = if name == "quantile" || name == "quartile" {
            if args.len() != 2 {
                return Err("Enter a quantile or quartile index.".into());
            }
            args[1].scalar()? / if name == "quartile" { 4. } else { 1. }
        } else {
            if args.len() != 1 {
                return Err("This distribution property takes no arguments.".into());
            }
            0.5
        };
        Ok(Value::Scalar(match name {
            "mean" => mean,
            "stdev" | "stdevp" => var.sqrt(),
            "var" | "varp" | "variance" => var,
            _ => evaluate(kind, p, "inversecdf", q)?,
        }))
    })())
}
