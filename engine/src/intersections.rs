use crate::{
    compiled::Program,
    eval::Environment,
    parser::Expr,
    plot::{self, Interest, Viewport},
};

// Multistart Newton refinement is used only for pairs involving an implicit or
// vertical relation. Explicit pairs have their own bracketed one-dimensional solver.
pub fn solve(env: &Environment, a: &Expr, b: &Expr, view: Viewport) -> Vec<Interest> {
    let pa = Program::compile(env, a);
    let pb = Program::compile(env, b);
    let fa = |x, y| {
        pa.as_ref()
            .map_or_else(|| plot::scalar(env, a, x, y), |p| p.eval(x, y, 0.))
    };
    let fb = |x, y| {
        pb.as_ref()
            .map_or_else(|| plot::scalar(env, b, x, y), |p| p.eval(x, y, 0.))
    };
    let sx = view.x_max - view.x_min;
    let sy = view.y_max - view.y_min;
    let hx = sx * 1e-6;
    let hy = sy * 1e-6;
    let mut found = Vec::new();
    for ix in 0..=12 {
        for iy in 0..=12 {
            let mut x = view.x_min + sx * ix as f64 / 12.;
            let mut y = view.y_min + sy * iy as f64 / 12.;
            for _ in 0..35 {
                let f = fa(x, y);
                let g = fb(x, y);
                if !f.is_finite() || !g.is_finite() {
                    break;
                }
                let fx = (fa(x + hx, y) - fa(x - hx, y)) / (2. * hx);
                let fy = (fa(x, y + hy) - fa(x, y - hy)) / (2. * hy);
                let gx = (fb(x + hx, y) - fb(x - hx, y)) / (2. * hx);
                let gy = (fb(x, y + hy) - fb(x, y - hy)) / (2. * hy);
                let det = fx * gy - fy * gx;
                if !det.is_finite() || det.abs() < 1e-18 {
                    break;
                }
                let dx = (gy * f - fy * g) / det;
                let dy = (fx * g - gx * f) / det;
                let scale = (dx.abs() / sx).max(dy.abs() / sy).max(1.);
                x -= dx / scale;
                y -= dy / scale;
                if x < view.x_min - sx
                    || x > view.x_max + sx
                    || y < view.y_min - sy
                    || y > view.y_max + sy
                {
                    break;
                }
                if dx.abs() < sx * 1e-10 && dy.abs() < sy * 1e-10 {
                    if x >= view.x_min
                        && x <= view.x_max
                        && y >= view.y_min
                        && y <= view.y_max
                        && fa(x, y).abs() < 1e-8
                        && fb(x, y).abs() < 1e-8
                    {
                        found.push(Interest {
                            x,
                            y,
                            kind: "intersection".into(),
                        });
                    }
                    break;
                }
            }
        }
    }
    plot::dedup(&mut found, sx.min(sy) * 1e-6);
    found
}
