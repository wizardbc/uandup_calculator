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
            if p.len() != 0 && p.len() != 2 {
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
            if p.len() != 2 {
                return Err(bad());
            }
            continuous!(Uniform::new(p[0], p[1]))
        }
        "binomialdist" => {
            if p.len() != 2 || p[0] < 0. || p[0].fract() != 0. || p[0] > 1e6 {
                return Err(bad());
            }
            discrete!(Binomial::new(p[1], p[0] as u64))
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
            discrete!(Geometric::new(p[0]))
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
