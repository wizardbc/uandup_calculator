use crate::eval::Value;
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Statistics {
    pub count: usize,
    pub mean: f64,
    pub median: f64,
    pub stdev: f64,
    pub stdevp: f64,
    pub five_number: [f64; 5],
}
pub fn median(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        f64::NAN
    } else {
        (xs[(xs.len() - 1) / 2] + xs[xs.len() / 2]) / 2.
    }
}
pub fn quartile(xs: &[f64], q: usize) -> f64 {
    if xs.is_empty() {
        return f64::NAN;
    }
    match q {
        0 => xs[0],
        1 => median(&xs[..(xs.len() / 2).max(1)]),
        2 => median(xs),
        3 => median(&xs[(xs.len() + 1) / 2..]).max(if xs.len() == 1 {
            xs[0]
        } else {
            f64::NEG_INFINITY
        }),
        4 => xs[xs.len() - 1],
        _ => f64::NAN,
    }
}
impl Statistics {
    pub fn new(values: &[f64]) -> Result<Self, String> {
        if values.is_empty() || values.iter().any(|x| !x.is_finite()) {
            return Err("Use a nonempty list of finite numbers.".into());
        }
        let mut xs = values.to_vec();
        xs.sort_by(f64::total_cmp);
        let n = xs.len();
        let mean = xs.iter().sum::<f64>() / n as f64;
        let sum = xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>();
        Ok(Self {
            count: n,
            mean,
            median: median(&xs),
            stdev: (sum / (n as f64 - 1.)).sqrt(),
            stdevp: (sum / n as f64).sqrt(),
            five_number: std::array::from_fn(|i| quartile(&xs, i)),
        })
    }
}
fn equal(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Scalar(a), Value::Scalar(b)) => a == b || (a.is_nan() && b.is_nan()),
        (Value::Complex(a), Value::Complex(b)) => a == b,
        (Value::Point(x, y), Value::Point(a, b)) => x == a && y == b,
        _ => false,
    }
}
fn rank(xs: &[f64]) -> Vec<f64> {
    let mut indices: Vec<_> = (0..xs.len()).collect();
    indices.sort_by(|&i, &j| xs[i].total_cmp(&xs[j]));
    let mut ranks = vec![0.; xs.len()];
    let mut i = 0;
    while i < indices.len() {
        let mut end = i + 1;
        while end < indices.len() && xs[indices[i]] == xs[indices[end]] {
            end += 1;
        }
        let rank = (i + end - 1) as f64 / 2.;
        for j in i..end {
            ranks[indices[j]] = rank;
        }
        i = end;
    }
    ranks
}
pub fn function(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    if ![
        "stats", "quartile", "covp", "spearman", "varp", "repeat", "unique", "sort", "join",
        "distance", "midpoint", "x", "y", "csch", "sech", "coth", "logbase",
    ]
    .contains(&name)
    {
        return None;
    }
    Some((|| {
        let first = args.first().ok_or("Enter an argument.")?;
        if ["csch", "sech", "coth"].contains(&name) {
            if args.len() != 1 {
                return Err("Use one argument.".into());
            }
            return crate::eval::unary(first.clone(), &|x| {
                1. / match name {
                    "csch" => x.sinh(),
                    "sech" => x.cosh(),
                    _ => x.tanh(),
                }
            });
        }
        if name == "logbase" {
            if args.len() != 2 {
                return Err("Use logbase(value, base).".into());
            }
            let base = args[1].scalar()?;
            return crate::eval::unary(first.clone(), &|x| x.log(base));
        }
        if name == "x" || name == "y" {
            fn coord(v: &Value, x: bool) -> Result<Value, String> {
                match v {
                    Value::Point(a, b) => Ok(Value::Scalar(if x { *a } else { *b })),
                    Value::List(xs) => Ok(Value::List(
                        xs.iter().map(|v| coord(v, x)).collect::<Result<_, _>>()?,
                    )),
                    _ => Err("Use a point's x or y coordinate.".into()),
                }
            }
            if args.len() != 1 {
                return Err("A coordinate property takes no arguments.".into());
            }
            return coord(first, name == "x");
        }
        if name == "distance" || name == "midpoint" {
            if args.len() != 2 {
                return Err("Use two points.".into());
            }
            fn points(a: &Value, b: &Value, distance: bool) -> Result<Value, String> {
                match (a, b) {
                    (Value::Point(x, y), Value::Point(a, b)) => Ok(if distance {
                        Value::Scalar((x - a).hypot(y - b))
                    } else {
                        Value::Point((x + a) / 2., (y + b) / 2.)
                    }),
                    (Value::List(a), Value::List(b)) if a.len() == b.len() => Ok(Value::List(
                        a.iter()
                            .zip(b)
                            .map(|(a, b)| points(a, b, distance))
                            .collect::<Result<_, _>>()?,
                    )),
                    (Value::List(xs), v) => Ok(Value::List(
                        xs.iter()
                            .map(|x| points(x, v, distance))
                            .collect::<Result<_, _>>()?,
                    )),
                    (v, Value::List(xs)) => Ok(Value::List(
                        xs.iter()
                            .map(|x| points(v, x, distance))
                            .collect::<Result<_, _>>()?,
                    )),
                    _ => Err("Use points or equally sized lists of points.".into()),
                }
            }
            return points(first, &args[1], name == "distance");
        }
        if name == "repeat" {
            if args.len() != 2
                || !matches!(
                    first,
                    Value::Scalar(_) | Value::Complex(_) | Value::Point(..)
                )
            {
                return Err("Use repeat(value, count).".into());
            }
            let n = args[1].scalar()?;
            if !n.is_finite() || n < 0. || n.fract() != 0. || n > 10000. {
                return Err("The repeat count must be an integer from 0 to 10,000.".into());
            }
            return Ok(Value::List(vec![first.clone(); n as usize]));
        }
        if name == "join" {
            let mut all = vec![];
            for value in args {
                match value {
                    Value::List(xs) => all.extend(xs.clone()),
                    Value::Scalar(_) | Value::Complex(_) | Value::Point(..) => {
                        all.push(value.clone())
                    }
                    _ => return Err("Join numbers, points, or lists.".into()),
                }
            }
            if all.len() > 10000 {
                return Err("A list can have at most 10,000 elements.".into());
            }
            return Ok(Value::List(all));
        }
        if name == "unique" || name == "sort" {
            let Value::List(xs) = first else {
                return Err("Use a list.".into());
            };
            if name == "unique" {
                if args.len() != 1 {
                    return Err("Unique takes one list.".into());
                }
                let mut out = vec![];
                for v in xs {
                    if !out.iter().any(|x| equal(x, v)) {
                        out.push(v.clone());
                    }
                }
                return Ok(Value::List(out));
            }
            if args.len() > 2 {
                return Err("Use sort(list) or sort(list, keys).".into());
            }
            let keys = if let Some(keys) = args.get(1) {
                keys.numbers()?
            } else {
                first.numbers()?
            };
            if keys.len() != xs.len() {
                return Err("Use equally sized lists of values and keys.".into());
            }
            let mut order: Vec<_> = (0..xs.len()).collect();
            order.sort_by(|&a, &b| keys[a].total_cmp(&keys[b]));
            return Ok(Value::List(
                order.into_iter().map(|i| xs[i].clone()).collect(),
            ));
        }
        if name == "stats" {
            if args.len() != 1 {
                return Err("Use stats(data).".into());
            }
            return Ok(Value::Statistics(Statistics::new(&first.numbers()?)?));
        }
        if name == "varp" {
            let mut xs = vec![];
            for a in args {
                xs.extend(a.numbers()?);
            }
            let mean = xs.iter().sum::<f64>() / xs.len() as f64;
            return Ok(Value::Scalar(
                xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / xs.len() as f64,
            ));
        }
        if name == "quartile" {
            if args.len() != 2 {
                return Err("Use quartile(list, index).".into());
            }
            let mut xs = first.numbers()?;
            xs.sort_by(f64::total_cmp);
            return crate::eval::unary(args[1].clone(), &|q| {
                if (0. ..=4.).contains(&q) && q.fract() == 0. {
                    quartile(&xs, q as usize)
                } else {
                    f64::NAN
                }
            });
        }
        if args.len() != 2 {
            return Err("Use two lists of equal length.".into());
        }
        let mut a = first.numbers()?;
        let mut b = args[1].numbers()?;
        if a.len() != b.len() || a.is_empty() {
            return Err("Use two nonempty lists of equal length.".into());
        }
        if name == "spearman" {
            a = rank(&a);
            b = rank(&b);
        }
        let n = a.len() as f64;
        let ma = a.iter().sum::<f64>() / n;
        let mb = b.iter().sum::<f64>() / n;
        let cross = a
            .iter()
            .zip(&b)
            .map(|(x, y)| (x - ma) * (y - mb))
            .sum::<f64>();
        Ok(Value::Scalar(if name == "covp" {
            cross / n
        } else {
            cross
                / (a.iter().map(|x| (x - ma).powi(2)).sum::<f64>()
                    * b.iter().map(|x| (x - mb).powi(2)).sum::<f64>())
                .sqrt()
        }))
    })())
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{eval::Environment, parser};
    use std::collections::HashMap;
    fn value(s: &str) -> Value {
        Environment::default()
            .eval(&parser::parse(s).unwrap(), &HashMap::new())
            .unwrap()
    }
    #[test]
    fn reference_statistics() {
        assert_eq!(value("quartile([1,2,3,4,5],1)").scalar().unwrap(), 1.5);
        assert_eq!(value("quantile([1,2,3,4],0.25)").scalar().unwrap(), 1.75);
        assert!(
            (value("spearman([1,2,2,4],[4,3,1,2])").scalar().unwrap() + 0.6324555320336759).abs()
                < 1e-14
        );
        assert_eq!(value("covp([1,2,3],[2,4,6])").scalar().unwrap(), 4. / 3.);
        assert_eq!(value("varp([1,2,3])").scalar().unwrap(), 2. / 3.);
    }
    #[test]
    fn list_order_and_geometry() {
        assert_eq!(
            value(r"[x^2\operatorname{for}x=[1...4]]")
                .numbers()
                .unwrap(),
            vec![1., 4., 9., 16.]
        );
        assert_eq!(
            value(r"[x+y\operatorname{for}x=[1,2],y=[3,4]]")
                .numbers()
                .unwrap(),
            vec![4., 5., 5., 6.]
        );
        assert_eq!(
            value("unique([3,1,3,2,1])").numbers().unwrap(),
            vec![3., 1., 2.]
        );
        assert_eq!(
            value("sort([10,20,30],[3,1,2])").numbers().unwrap(),
            vec![20., 30., 10.]
        );
        assert_eq!(value("repeat(2,3)").numbers().unwrap(), vec![2.; 3]);
        assert_eq!(value("distance((1,2),(4,6))").scalar().unwrap(), 5.);
        assert_eq!(value("midpoint((1,2),(4,6)).x").scalar().unwrap(), 2.5);
    }
}
