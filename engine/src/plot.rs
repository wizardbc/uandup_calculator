use crate::compiled::Program;
use crate::{
    eval::{Environment, Value},
    parser::Expr,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Viewport {
    pub x_min: f64,
    pub x_max: f64,
    pub y_min: f64,
    pub y_max: f64,
    pub width: f64,
    pub height: f64,
}
impl Viewport {
    pub fn valid(&self) -> bool {
        [
            self.x_min,
            self.x_max,
            self.y_min,
            self.y_max,
            self.width,
            self.height,
        ]
        .iter()
        .all(|x| x.is_finite())
            && self.x_max > self.x_min
            && self.y_max > self.y_min
            && self.width > 0.
            && self.height > 0.
    }
}
#[derive(Serialize, Clone)]
pub struct Geometry {
    pub kind: String,
    pub start: usize,
    pub count: usize,
    pub dashed: bool,
}
#[derive(Serialize, Clone, Debug)]
pub struct Interest {
    pub x: f64,
    pub y: f64,
    pub kind: String,
}

pub fn push(geometry: &mut Vec<f64>, points: &[f64], kind: &str, dashed: bool) -> Geometry {
    let start = geometry.len();
    geometry.extend(points);
    Geometry {
        kind: kind.into(),
        start,
        count: points.len(),
        dashed,
    }
}
pub fn scalar(env: &Environment, expr: &Expr, x: f64, y: f64) -> f64 {
    let mut vars = HashMap::new();
    vars.insert("x".into(), Value::Scalar(x));
    vars.insert("y".into(), Value::Scalar(y));
    env.eval(expr, &vars)
        .and_then(|x| x.scalar())
        .unwrap_or(f64::NAN)
}

pub fn explicit(
    env: &Environment,
    expr: &Expr,
    view: Viewport,
    vertical: bool,
    geometry: &mut Vec<f64>,
) -> (Vec<Geometry>, Vec<Interest>) {
    let (lo, hi, pixels, other) = if vertical {
        (view.y_min, view.y_max, view.height, view.x_max - view.x_min)
    } else {
        (view.x_min, view.x_max, view.width, view.y_max - view.y_min)
    };
    let program = Program::compile(env, expr);
    let f = |x: f64| {
        if let Some(p) = &program {
            if vertical {
                p.eval(0., x, 0.)
            } else {
                p.eval(x, 0., 0.)
            }
        } else if vertical {
            scalar(env, expr, 0., x)
        } else {
            scalar(env, expr, x, 0.)
        }
    };
    let n = (pixels / 2.).ceil().clamp(64., 2048.) as usize;
    let mut data = Vec::new();
    let mut interests = Vec::new();
    let mut prev_slope = f64::NAN;
    let convert = |x, y| if vertical { [y, x] } else { [x, y] };
    fn refine(
        f: &impl Fn(f64) -> f64,
        a: f64,
        b: f64,
        fa: f64,
        fb: f64,
        scale: f64,
        depth: u8,
        out: &mut Vec<(f64, f64)>,
    ) {
        let mid = (a + b) / 2.;
        let fm = f(mid);
        let error = (fm - (fa + fb) / 2.).abs() / scale;
        if depth > 0 && (!fa.is_finite() || !fb.is_finite() || !fm.is_finite() || error > 0.0007) {
            refine(f, a, mid, fa, fm, scale, depth - 1, out);
            refine(f, mid, b, fm, fb, scale, depth - 1, out);
        } else {
            if !fa.is_finite()
                || !fb.is_finite()
                || !fm.is_finite()
                || (error > 0.05 && (fb - fa).abs() > scale * 0.4)
            {
                out.push((f64::NAN, f64::NAN));
            }
            out.push((b, fb));
        }
    }
    let mut x0 = lo;
    let mut y0 = f(x0);
    data.extend(convert(x0, y0));
    for i in 1..=n {
        let x1 = lo + (hi - lo) * i as f64 / n as f64;
        let y1 = f(x1);
        let mut segment = Vec::new();
        refine(&f, x0, x1, y0, y1, other, 6, &mut segment);
        for (x, y) in segment {
            data.extend(convert(x, y));
        }
        if y0.is_finite() && y1.is_finite() {
            if y0 * y1 <= 0. && (y0 != 0. || y1 != 0.) {
                if let Some(x) = root(&f, x0, x1) {
                    let p = convert(x, 0.);
                    interests.push(Interest {
                        x: p[0],
                        y: p[1],
                        kind: "intercept".into(),
                    });
                }
            }
            let slope = (y1 - y0) / (x1 - x0);
            if slope * prev_slope < 0. {
                let a = x0 - (x1 - x0);
                let b = x1;
                let h = (hi - lo) * 1e-6;
                let d = |x| (f(x + h) - f(x - h)) / (2. * h);
                if let Some(x) = root(&d, a, b) {
                    let y = f(x);
                    if y.is_finite() {
                        let p = convert(x, y);
                        interests.push(Interest {
                            x: p[0],
                            y: p[1],
                            kind: "extremum".into(),
                        });
                    }
                }
            }
            prev_slope = slope;
        } else {
            prev_slope = f64::NAN;
        }
        x0 = x1;
        y0 = y1;
    }
    if lo <= 0. && hi >= 0. {
        let y = f(0.);
        if y.is_finite() {
            let p = convert(0., y);
            interests.push(Interest {
                x: p[0],
                y: p[1],
                kind: "intercept".into(),
            });
        }
    }
    interests.retain(|p| {
        p.x >= view.x_min && p.x <= view.x_max && p.y >= view.y_min && p.y <= view.y_max
    });
    dedup(&mut interests, (hi - lo) * 1e-6);
    (vec![push(geometry, &data, "path", false)], interests)
}
pub fn root(f: &impl Fn(f64) -> f64, mut a: f64, mut b: f64) -> Option<f64> {
    let mut fa = f(a);
    let fb = f(b);
    if fa.abs() < 1e-12 {
        return Some(a);
    }
    if fb.abs() < 1e-12 {
        return Some(b);
    }
    if !fa.is_finite() || !fb.is_finite() || fa * fb > 0. {
        return None;
    }
    for _ in 0..55 {
        let m = (a + b) / 2.;
        let fm = f(m);
        if !fm.is_finite() {
            return None;
        }
        if fm.abs() < 1e-12 {
            return Some(m);
        }
        if fa * fm <= 0. {
            b = m;
        } else {
            a = m;
            fa = fm;
        }
    }
    let x = (a + b) / 2.;
    if f(x).abs() < 1e-6 { Some(x) } else { None }
}
pub fn dedup(points: &mut Vec<Interest>, eps: f64) {
    let mut seen: Vec<(f64, f64)> = vec![];
    points.retain(|p| {
        if seen
            .iter()
            .any(|(x, y)| (p.x - x).abs() < eps && (p.y - y).abs() < eps)
        {
            false
        } else {
            seen.push((p.x, p.y));
            true
        }
    });
}

// Marching squares with edge root refinement. Fills are cell polygons, not CSS overlays.
pub fn implicit(
    env: &Environment,
    a: &Expr,
    b: &Expr,
    op: &str,
    view: Viewport,
    geometry: &mut Vec<f64>,
) -> Vec<Geometry> {
    let nx = (view.width / 5.).ceil().clamp(40., 300.) as usize;
    let ny = (view.height / 5.).ceil().clamp(40., 240.) as usize;
    let dx = (view.x_max - view.x_min) / nx as f64;
    let dy = (view.y_max - view.y_min) / ny as f64;
    let pa = Program::compile(env, a);
    let pb = Program::compile(env, b);
    let f = |x, y| {
        pa.as_ref()
            .map_or_else(|| scalar(env, a, x, y), |p| p.eval(x, y, 0.))
            - pb.as_ref()
                .map_or_else(|| scalar(env, b, x, y), |p| p.eval(x, y, 0.))
    };
    let mut values = vec![0.; (nx + 1) * (ny + 1)];
    for j in 0..=ny {
        for i in 0..=nx {
            values[j * (nx + 1) + i] = f(view.x_min + i as f64 * dx, view.y_min + j as f64 * dy);
        }
    }
    let mut lines = Vec::new();
    let mut fill = Vec::new();
    let difference = Expr::Binary("-".into(), Box::new(a.clone()), Box::new(b.clone()));
    fn hidden_loop(
        f: &impl Fn(f64, f64) -> f64,
        env: &Environment,
        diff: &Expr,
        x: f64,
        y: f64,
        dx: f64,
        dy: f64,
        depth: u8,
        lines: &mut Vec<f64>,
    ) {
        use crate::interval::{Interval, bounds};
        if let Some(range) = bounds(env, diff, Interval(x, x + dx), Interval(y, y + dy), 0) {
            if !range.may_contain_zero() {
                return;
            }
        } else {
            return;
        }
        let corners = [
            (x, y, f(x, y)),
            (x + dx, y, f(x + dx, y)),
            (x + dx, y + dy, f(x + dx, y + dy)),
            (x, y + dy, f(x, y + dy)),
        ];
        let mut cuts = vec![];
        for i in 0..4 {
            let a = corners[i];
            let b = corners[(i + 1) % 4];
            if a.2.is_finite() && b.2.is_finite() && (a.2 >= 0.) != (b.2 >= 0.) {
                let line = |t| f(a.0 + t * (b.0 - a.0), a.1 + t * (b.1 - a.1));
                if let Some(t) = root(&line, 0., 1.) {
                    cuts.push((a.0 + t * (b.0 - a.0), a.1 + t * (b.1 - a.1)));
                }
            }
        }
        if cuts.len() == 2 {
            lines.extend([cuts[0].0, cuts[0].1, cuts[1].0, cuts[1].1]);
            return;
        }
        if depth > 0 {
            for (sx, sy) in [(0., 0.), (0.5, 0.), (0., 0.5), (0.5, 0.5)] {
                hidden_loop(
                    f,
                    env,
                    diff,
                    x + sx * dx,
                    y + sy * dy,
                    dx / 2.,
                    dy / 2.,
                    depth - 1,
                    lines,
                );
            }
        }
    }
    let inequality = op != "=";
    let inside = |v: f64| {
        if op.starts_with('<') {
            v <= 0.
        } else {
            v >= 0.
        }
    };
    for j in 0..ny {
        for i in 0..nx {
            let x = view.x_min + i as f64 * dx;
            let y = view.y_min + j as f64 * dy;
            let corners = [
                (x, y, values[j * (nx + 1) + i]),
                (x + dx, y, values[j * (nx + 1) + i + 1]),
                (x + dx, y + dy, values[(j + 1) * (nx + 1) + i + 1]),
                (x, y + dy, values[(j + 1) * (nx + 1) + i]),
            ];
            if corners.iter().any(|p| !p.2.is_finite()) {
                continue;
            }
            let mut cuts = vec![];
            let mut polygon = vec![];
            for k in 0..4 {
                let p = corners[k];
                let q = corners[(k + 1) % 4];
                if inequality && inside(p.2) {
                    polygon.push((p.0, p.1));
                }
                if (p.2 >= 0.) != (q.2 >= 0.) {
                    let line = |t| f(p.0 + t * (q.0 - p.0), p.1 + t * (q.1 - p.1));
                    if let Some(t) = root(&line, 0., 1.) {
                        let pt = (p.0 + t * (q.0 - p.0), p.1 + t * (q.1 - p.1));
                        cuts.push(pt);
                        if inequality {
                            polygon.push(pt);
                        }
                    }
                }
            }
            if cuts.is_empty() && !inequality {
                hidden_loop(&f, env, &difference, x, y, dx, dy, 5, &mut lines);
            }
            if cuts.len() == 2 {
                lines.extend([cuts[0].0, cuts[0].1, cuts[1].0, cuts[1].1]);
            } else if cuts.len() == 4 {
                let center = f(x + dx / 2., y + dy / 2.);
                let start = if (center >= 0.) == (corners[0].2 >= 0.) {
                    0
                } else {
                    1
                };
                for k in [start, start + 2] {
                    let a = cuts[k % 4];
                    let b = cuts[(k + 1) % 4];
                    lines.extend([a.0, a.1, b.0, b.1]);
                }
            }
            if inequality && polygon.len() >= 3 {
                for k in 1..polygon.len() - 1 {
                    fill.extend([
                        polygon[0].0,
                        polygon[0].1,
                        polygon[k].0,
                        polygon[k].1,
                        polygon[k + 1].0,
                        polygon[k + 1].1,
                    ]);
                }
            }
        }
    }
    let mut out = vec![];
    if !fill.is_empty() {
        out.push(push(geometry, &fill, "triangles", false));
    }
    out.push(push(geometry, &lines, "segments", op == "<" || op == ">"));
    out
}

pub fn parametric(
    env: &Environment,
    x: &Expr,
    y: &Expr,
    polar: bool,
    view: Viewport,
    geometry: &mut Vec<f64>,
) -> Vec<Geometry> {
    let mut vars = HashMap::new();
    let mut data: Vec<f64> = vec![];
    let max = if polar { 2. * std::f64::consts::PI } else { 1. };
    for i in 0..=1600 {
        let t = i as f64 / 1600. * max;
        vars.insert(if polar { "theta" } else { "t" }.into(), Value::Scalar(t));
        let a = env
            .eval(x, &vars)
            .and_then(|v| v.scalar())
            .unwrap_or(f64::NAN);
        let b = env
            .eval(y, &vars)
            .and_then(|v| v.scalar())
            .unwrap_or(f64::NAN);
        let (a, b) = if polar {
            (a * t.cos(), a * t.sin())
        } else {
            (a, b)
        };
        if i > 0
            && ((a - data[data.len() - 2]).abs() > view.x_max - view.x_min
                || (b - data[data.len() - 1]).abs() > view.y_max - view.y_min)
        {
            data.extend([f64::NAN, f64::NAN]);
        }
        data.extend([a, b]);
    }
    vec![push(geometry, &data, "path", false)]
}
