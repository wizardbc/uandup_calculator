use crate::{
    eval::{Environment, Value},
    parser::Expr,
};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Fit {
    pub parameters: BTreeMap<String, f64>,
    pub r_squared: f64,
    pub residuals: Vec<f64>,
    pub log_mode: bool,
    pub log_mode_available: bool,
    pub rmse: f64,
    pub standard_errors: BTreeMap<String, f64>,
    pub degrees_of_freedom: usize,
    pub correlation: Option<f64>,
}

fn solve(mut a: Vec<Vec<f64>>, mut b: Vec<f64>) -> Option<Vec<f64>> {
    let n = b.len();
    for i in 0..n {
        let pivot = (i..n).max_by(|&j, &k| a[j][i].abs().total_cmp(&a[k][i].abs()))?;
        if a[pivot][i].abs() < 1e-20 {
            return None;
        }
        a.swap(i, pivot);
        b.swap(i, pivot);
        let d = a[i][i];
        for j in i..n {
            a[i][j] /= d;
        }
        b[i] /= d;
        for k in 0..n {
            if k != i {
                let f = a[k][i];
                for j in i..n {
                    a[k][j] -= f * a[i][j];
                }
                b[k] -= f * b[i];
            }
        }
    }
    Some(b)
}
fn logarithmic(expr: &Expr) -> bool {
    match expr {
        Expr::Binary(op, a, b) => {
            (op == "^" && !matches!(b.as_ref(), Expr::Num(_))) || logarithmic(a) || logarithmic(b)
        }
        Expr::Call(n, _) => n == "exp",
        _ => false,
    }
}
fn has_sine(expr: &Expr) -> bool {
    match expr {
        Expr::Call(n, args) => n == "sin" || args.iter().any(has_sine),
        Expr::Binary(_, a, b) => has_sine(a) || has_sine(b),
        Expr::Unary(_, a) => has_sine(a),
        _ => false,
    }
}

pub fn fit(
    env: &Environment,
    left: &Expr,
    right: &Expr,
    requested_log: Option<bool>,
) -> Result<Fit, String> {
    let empty = HashMap::new();
    let observed = env.eval(left, &empty)?.numbers()?;
    let params: Vec<_> = right
        .variables()
        .into_iter()
        .filter(|n| !env.values.contains_key(n) && !env.definitions.contains_key(n))
        .collect();
    if params.is_empty() {
        return Err("This regression needs an unknown parameter.".into());
    }
    if params.len() > 6 || observed.len() < params.len() || observed.len() > 2000 {
        return Err(
            "Use at least as many data points as parameters, and at most six parameters.".into(),
        );
    }
    let log_mode_available = logarithmic(right) && observed.iter().all(|x| *x > 0.);
    let log_mode = log_mode_available && requested_log.unwrap_or(true);
    let predict = |p: &[f64]| -> Result<Vec<f64>, String> {
        let vars: HashMap<_, _> = params
            .iter()
            .cloned()
            .zip(p.iter().map(|x| Value::Scalar(*x)))
            .collect();
        let mut ys = env.eval(right, &vars)?.numbers()?;
        if ys.len() == 1 {
            ys = vec![ys[0]; observed.len()];
        }
        if ys.len() != observed.len() {
            return Err("The regression lists must have the same length.".into());
        }
        Ok(ys)
    };
    let residual = |p: &[f64]| -> Result<Vec<f64>, String> {
        Ok(predict(p)?
            .iter()
            .zip(&observed)
            .map(|(a, b)| if log_mode { a.ln() - b.ln() } else { a - b })
            .collect())
    };
    let cost = |r: &[f64]| r.iter().map(|x| x * x).sum::<f64>();
    let mut best: Option<(f64, Vec<f64>)> = None;
    let mut starts: Vec<Vec<f64>> = [1., 0.1, 2.]
        .iter()
        .map(|n| vec![*n; params.len()])
        .collect();
    // Estimate sinusoidal frequency before nonlinear refinement. A fixed-frequency
    // sine/cosine fit is linear and avoids getting trapped in an unrelated period.
    if has_sine(right) && params.len() == 4 {
        let positions: Option<Vec<_>> = ['a', 'b', 'c', 'd']
            .iter()
            .map(|letter| {
                params.iter().position(|name| {
                    name == &letter.to_string() || name.starts_with(&format!("{letter}_"))
                })
            })
            .collect();
        let xs = right
            .variables()
            .iter()
            .filter_map(|n| env.values.get(n))
            .find_map(|v| {
                if let Value::List(_) = v {
                    v.numbers().ok()
                } else {
                    None
                }
            });
        if let (Some(positions), Some(xs)) = (positions, xs) {
            if xs.len() == observed.len() && xs.iter().all(|n| n.is_finite()) {
                let min = xs.iter().copied().fold(f64::INFINITY, f64::min);
                let max = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                let span = max - min;
                if span > 0. {
                    let mut candidates = vec![];
                    for i in 1..=256 {
                        let omega =
                            std::f64::consts::PI * (xs.len() as f64) * (i as f64 / 256.) / span;
                        let basis: Vec<_> = xs
                            .iter()
                            .map(|x| [(omega * x).sin(), (omega * x).cos(), 1.])
                            .collect();
                        let mat = (0..3)
                            .map(|a| {
                                (0..3)
                                    .map(|b| basis.iter().map(|r| r[a] * r[b]).sum())
                                    .collect()
                            })
                            .collect();
                        let rhs = (0..3)
                            .map(|a| basis.iter().zip(&observed).map(|(r, y)| r[a] * y).sum())
                            .collect();
                        if let Some(q) = solve(mat, rhs) {
                            let score: f64 = basis
                                .iter()
                                .zip(&observed)
                                .map(|(r, y)| (q[0] * r[0] + q[1] * r[1] + q[2] - y).powi(2))
                                .sum();
                            let unit = if env.degrees {
                                180. / std::f64::consts::PI
                            } else {
                                1.
                            };
                            let mut p = vec![0.; 4];
                            p[positions[0]] = q[0].hypot(q[1]);
                            p[positions[1]] = omega * unit;
                            p[positions[2]] = q[1].atan2(q[0]) * unit;
                            p[positions[3]] = q[2];
                            candidates.push((score, p));
                        }
                    }
                    candidates.sort_by(|a, b| a.0.total_cmp(&b.0));
                    starts.extend(candidates.into_iter().take(4).map(|(_, p)| p));
                }
            }
        }
    }
    for mut p in starts {
        let mut r = residual(&p)?;
        let mut score = cost(&r);
        let mut lambda = 1e-3;
        for _ in 0..100 {
            if !score.is_finite() {
                break;
            }
            let mut jac = vec![vec![0.; params.len()]; observed.len()];
            for j in 0..params.len() {
                let h = 1e-5 * (p[j].abs() + 1.);
                let mut q = p.clone();
                q[j] += h;
                let plus = residual(&q)?;
                q[j] -= 2. * h;
                let minus = residual(&q)?;
                for i in 0..observed.len() {
                    jac[i][j] = (plus[i] - minus[i]) / (2. * h);
                }
            }
            let mut mat = vec![vec![0.; params.len()]; params.len()];
            let mut rhs = vec![0.; params.len()];
            for j in 0..params.len() {
                for k in 0..params.len() {
                    mat[j][k] = jac.iter().map(|row| row[j] * row[k]).sum();
                }
                rhs[j] = -jac.iter().zip(&r).map(|(row, r)| row[j] * r).sum::<f64>();
                mat[j][j] += lambda * (mat[j][j] + 1e-9);
            }
            let Some(delta) = solve(mat, rhs) else {
                lambda *= 10.;
                continue;
            };
            let q: Vec<_> = p.iter().zip(&delta).map(|(a, b)| a + b).collect();
            let next_r = residual(&q)?;
            let next = cost(&next_r);
            if next < score {
                let improvement = score - next;
                p = q;
                r = next_r;
                score = next;
                lambda = (lambda / 4.).max(1e-12);
                if score < 1e-24 || improvement < 1e-13 * (1. + score) {
                    break;
                }
            } else {
                lambda *= 8.;
                if lambda > 1e15 {
                    break;
                }
            }
        }
        if score.is_finite() && best.as_ref().is_none_or(|(s, _)| score < *s) {
            best = Some((score, p));
        }
    }
    let (_, p) = best.ok_or("Couldn't find a regression. Check the model and data.")?;
    let predicted = predict(&p)?;
    let residuals: Vec<_> = observed
        .iter()
        .zip(&predicted)
        .map(|(a, b)| a - b)
        .collect();
    let sum = cost(&residuals);
    let mean = observed.iter().sum::<f64>() / observed.len() as f64;
    let total = observed.iter().map(|x| (x - mean).powi(2)).sum::<f64>();
    let dof = observed.len().saturating_sub(params.len());
    let mut standard_errors = BTreeMap::new();
    if dof > 0 && !log_mode {
        let jac: Vec<Vec<f64>> = p
            .iter()
            .enumerate()
            .map(|(j, value)| {
                let h = 1e-5 * (1. + value.abs());
                let mut shifted = p.clone();
                shifted[j] += h;
                predict(&shifted)
                    .map(|ys| {
                        ys.iter()
                            .zip(&predicted)
                            .map(|(a, b)| (a - b) / h)
                            .collect()
                    })
                    .unwrap_or_default()
            })
            .collect();
        if jac.iter().all(|c| c.len() == observed.len()) {
            let matrix: Vec<Vec<f64>> = jac
                .iter()
                .map(|a| {
                    jac.iter()
                        .map(|b| a.iter().zip(b).map(|(x, y)| x * y).sum())
                        .collect()
                })
                .collect();
            for (j, name) in params.iter().enumerate() {
                let mut unit = vec![0.; params.len()];
                unit[j] = 1.;
                if let Some(column) = solve(matrix.clone(), unit) {
                    let se = (column[j] * sum / dof as f64).sqrt();
                    if se.is_finite() {
                        standard_errors.insert(name.clone(), se);
                    }
                }
            }
        }
    }
    let independent: Vec<_> = right
        .variables()
        .into_iter()
        .filter_map(|n| {
            env.values.get(&n).and_then(|v| {
                if matches!(v, Value::List(_)) {
                    v.numbers().ok()
                } else {
                    None
                }
            })
        })
        .collect();
    let correlation =
        if params.len() == 2 && independent.len() == 1 && independent[0].len() == observed.len() {
            let x = &independent[0];
            let xm = x.iter().sum::<f64>() / x.len() as f64;
            let covariance = x
                .iter()
                .zip(&observed)
                .map(|(a, b)| (a - xm) * (b - mean))
                .sum::<f64>();
            let variance = x.iter().map(|a| (a - xm).powi(2)).sum::<f64>();
            let r = covariance / (variance * total).sqrt();
            if r.is_finite() { Some(r) } else { None }
        } else {
            None
        };
    Ok(Fit {
        parameters: params.into_iter().zip(p).collect(),
        r_squared: if total > 0. {
            1. - sum / total
        } else if sum < 1e-16 {
            1.
        } else {
            0.
        },
        residuals,
        log_mode,
        log_mode_available,
        rmse: (sum / observed.len() as f64).sqrt(),
        standard_errors,
        degrees_of_freedom: dof,
        correlation,
    })
}
