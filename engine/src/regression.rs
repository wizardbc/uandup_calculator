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
    for start in [1., 0.1, 2.] {
        let mut p = vec![start; params.len()];
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
    })
}
