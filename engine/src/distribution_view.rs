use crate::{
    distributions::{evaluate, moments},
    eval::Environment,
    parser,
    plot::{self, Geometry, Viewport},
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Options {
    pub show: bool,
    pub summary: bool,
    pub region: String,
    pub compute: String,
    pub lower: Option<String>,
    pub upper: Option<String>,
    pub area: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub kind: String,
    pub parameters: Vec<f64>,
    pub mean: f64,
    pub median: f64,
    pub stdev: f64,
    pub variance: f64,
    pub lower: f64,
    pub upper: f64,
    pub area: f64,
    pub discrete: bool,
}
pub fn details(
    kind: &str,
    p: &[f64],
    options: &Options,
    env: &Environment,
) -> Result<View, String> {
    let (mean, variance) = moments(kind, p)?;
    let stdev = variance.sqrt();
    let eval = |s: &Option<String>, fallback: f64| -> Result<f64, String> {
        if let Some(s) = s {
            env.eval(&parser::parse(s)?, &HashMap::new())?.scalar()
        } else {
            Ok(fallback)
        }
    };
    let mut lower = eval(
        &options.lower,
        if (mean - stdev).is_finite() {
            mean - stdev
        } else {
            -1.
        },
    )?;
    let mut upper = eval(
        &options.upper,
        if (mean + stdev).is_finite() {
            mean + stdev
        } else {
            1.
        },
    )?;
    let region = options.region.as_str();
    let discrete = ["binomialdist", "poissondist", "geodist", "discretedist"].contains(&kind);
    let left_cdf = |x: f64| -> Result<f64, String> {
        if kind == "discretedist" {
            let total = p.chunks_exact(2).map(|p| p[1]).sum::<f64>();
            Ok(p.chunks_exact(2)
                .filter(|p| p[0] < x)
                .map(|p| p[1])
                .sum::<f64>()
                / total)
        } else {
            evaluate(kind, p, "cdf", if discrete { x.ceil() - 1. } else { x })
        }
    };
    let area = if options.compute == "bounds" {
        let area = eval(&options.area, 0.68)?;
        if !(0. ..=1.).contains(&area) {
            return Err("The probability must be between 0 and 1.".into());
        }
        match region {
            "left" => {
                lower = f64::NEG_INFINITY;
                upper = evaluate(kind, p, "inversecdf", area)?;
            }
            "right" => {
                lower = evaluate(kind, p, "inversecdf", 1. - area)?;
                upper = f64::INFINITY;
            }
            "outer" => {
                lower = evaluate(kind, p, "inversecdf", area / 2.)?;
                upper = evaluate(kind, p, "inversecdf", 1. - area / 2.)?;
            }
            _ => {
                lower = evaluate(kind, p, "inversecdf", (1. - area) / 2.)?;
                upper = evaluate(kind, p, "inversecdf", (1. + area) / 2.)?;
            }
        }
        area
    } else {
        if lower.is_nan() || upper.is_nan() {
            return Err("Check the probability bounds.".into());
        }
        match region {
            "left" => {
                lower = f64::NEG_INFINITY;
                evaluate(kind, p, "cdf", upper)?
            }
            "right" => {
                upper = f64::INFINITY;
                1. - left_cdf(lower)?
            }
            "outer" => {
                if lower > upper {
                    1.
                } else {
                    left_cdf(lower)? + 1. - evaluate(kind, p, "cdf", upper)?
                }
            }
            _ => {
                if lower > upper {
                    0.
                } else {
                    evaluate(kind, p, "cdf", upper)? - left_cdf(lower)?
                }
            }
        }
    };
    Ok(View {
        kind: kind.into(),
        parameters: p.to_vec(),
        mean,
        median: evaluate(kind, p, "inversecdf", 0.5)?,
        stdev,
        variance,
        lower,
        upper,
        area: area.clamp(0., 1.),
        discrete,
    })
}
pub fn geometry(
    view: &View,
    options: &Options,
    env: &Environment,
    value_expr: &parser::Expr,
    viewport: Viewport,
    buffer: &mut Vec<f64>,
) -> Vec<Geometry> {
    let mut geometry = vec![];
    let p = &view.parameters;
    let kind = &view.kind;
    let selected = |x: f64| {
        options.show
            && if options.region == "outer" {
                x <= view.lower || x >= view.upper
            } else {
                x >= view.lower && x <= view.upper
            }
    };
    if view.discrete {
        let xs = if kind == "discretedist" {
            let mut xs: Vec<_> = p.chunks_exact(2).map(|p| p[0]).collect();
            xs.sort_by(f64::total_cmp);
            xs.dedup();
            xs
        } else {
            let lo = viewport
                .x_min
                .ceil()
                .max(if kind == "geodist" { 1. } else { 0. });
            let hi = viewport
                .x_max
                .floor()
                .min(if kind == "binomialdist" { p[0] } else { 1e6 });
            if hi - lo > 10000. {
                vec![]
            } else {
                (lo as i64..=hi as i64).map(|x| x as f64).collect()
            }
        };
        let mut points = vec![];
        let mut bars = vec![];
        for x in xs {
            if let Ok(y) = evaluate(kind, p, "pdf", x) {
                points.extend([x, y]);
                if selected(x) {
                    let lo = x - 0.5;
                    let hi = x + 0.5;
                    bars.extend([lo, 0., hi, 0., hi, y, lo, 0., hi, y, lo, y]);
                }
            }
        }
        if !bars.is_empty() {
            geometry.push(plot::push(buffer, &bars, "triangles", false));
        }
        geometry.push(plot::push(buffer, &points, "points", false));
    } else {
        let pdf = parser::Expr::Call(
            "pdf".into(),
            vec![value_expr.clone(), parser::Expr::Var("x".into())],
        );
        let (g, _) = plot::explicit(env, &pdf, viewport, false, buffer);
        if options.show {
            let ranges = if options.region == "outer" {
                vec![(viewport.x_min, view.lower), (view.upper, viewport.x_max)]
            } else {
                vec![(view.lower, view.upper)]
            };
            let mut fill = vec![];
            for (a, b) in ranges {
                let a = a.max(viewport.x_min);
                let b = b.min(viewport.x_max);
                if a >= b {
                    continue;
                }
                for i in 0..256 {
                    let x = a + (b - a) * i as f64 / 256.;
                    let x2 = a + (b - a) * (i + 1) as f64 / 256.;
                    let y = evaluate(kind, p, "pdf", x).unwrap_or(0.);
                    let y2 = evaluate(kind, p, "pdf", x2).unwrap_or(0.);
                    if (y + y2).is_finite() {
                        fill.extend([x, 0., x2, 0., x2, y2, x, 0., x2, y2, x, y]);
                    }
                }
            }
            if !fill.is_empty() {
                geometry.push(plot::push(buffer, &fill, "triangles", false));
            }
        }
        geometry.extend(g);
    }
    geometry
}
