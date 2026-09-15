use crate::{
    eval::{Definition, Environment, Value},
    parser::Expr,
};

#[derive(Clone, Copy)]
pub struct Interval(pub f64, pub f64);
impl Interval {
    fn new(a: f64, b: f64) -> Option<Self> {
        if a.is_nan() || b.is_nan() {
            None
        } else {
            Some(Self(a.min(b), a.max(b)))
        }
    }
    pub fn may_contain_zero(self) -> bool {
        let epsilon = 1e-12 * (1. + self.0.abs().min(self.1.abs()));
        self.0 <= epsilon && self.1 >= -epsilon
    }
}
pub fn bounds(
    env: &Environment,
    expr: &Expr,
    x: Interval,
    y: Interval,
    depth: usize,
) -> Option<Interval> {
    if depth > 32 {
        return None;
    }
    let ev = |e: &Expr| bounds(env, e, x, y, depth + 1);
    match expr {
        Expr::Num(n) => Some(Interval(*n, *n)),
        Expr::Var(name) => match name.as_str() {
            "x" => Some(x),
            "y" => Some(y),
            "pi" => Some(Interval(std::f64::consts::PI, std::f64::consts::PI)),
            "e" => Some(Interval(std::f64::consts::E, std::f64::consts::E)),
            _ => {
                if let Some(Value::Scalar(v)) = env.values.get(name) {
                    Some(Interval(*v, *v))
                } else if let Some(Definition::Variable(e)) = env.definitions.get(name) {
                    ev(e)
                } else {
                    None
                }
            }
        },
        Expr::Unary(op, e) => {
            let a = ev(e)?;
            if *op == '-' {
                Some(Interval(-a.1, -a.0))
            } else {
                Some(a)
            }
        }
        Expr::Binary(op, a, b) => {
            let a = ev(a)?;
            let b = ev(b)?;
            match op.as_str() {
                "+" => Interval::new(a.0 + b.0, a.1 + b.1),
                "-" => Interval::new(a.0 - b.1, a.1 - b.0),
                "*" | "/" => {
                    let b = if op == "/" {
                        if b.0 <= 0. && b.1 >= 0. {
                            return None;
                        }
                        Interval::new(1. / b.0, 1. / b.1)?
                    } else {
                        b
                    };
                    let p = [a.0 * b.0, a.0 * b.1, a.1 * b.0, a.1 * b.1];
                    Interval::new(
                        p.iter().copied().fold(f64::INFINITY, f64::min),
                        p.iter().copied().fold(f64::NEG_INFINITY, f64::max),
                    )
                }
                "^" if b.0 == b.1 && b.0.fract() == 0. && b.0 > 0. => {
                    let lo = if (b.0 as i64) % 2 == 0 && a.0 <= 0. && a.1 >= 0. {
                        0.
                    } else {
                        a.0.powf(b.0).min(a.1.powf(b.0))
                    };
                    Interval::new(lo, a.0.powf(b.0).max(a.1.powf(b.0)))
                }
                _ => None,
            }
        }
        Expr::Call(name, args) if args.len() == 1 => {
            let a = ev(&args[0])?;
            match name.as_str() {
                "sqrt" if a.1 >= 0. => Interval::new(a.0.max(0.).sqrt(), a.1.sqrt()),
                "abs" => Interval::new(
                    if a.0 <= 0. && a.1 >= 0. {
                        0.
                    } else {
                        a.0.abs().min(a.1.abs())
                    },
                    a.0.abs().max(a.1.abs()),
                ),
                "exp" => Interval::new(a.0.exp(), a.1.exp()),
                "ln" if a.0 > 0. => Interval::new(a.0.ln(), a.1.ln()),
                "sin" | "cos" => {
                    let scale = if env.degrees {
                        std::f64::consts::PI / 180.
                    } else {
                        1.
                    };
                    let shift = if name == "cos" {
                        std::f64::consts::FRAC_PI_2
                    } else {
                        0.
                    };
                    let a = Interval(a.0 * scale + shift, a.1 * scale + shift);
                    if a.1 - a.0 >= std::f64::consts::TAU {
                        return Some(Interval(-1., 1.));
                    }
                    let mut lo = a.0.sin().min(a.1.sin());
                    let mut hi = a.0.sin().max(a.1.sin());
                    let start =
                        ((a.0 - std::f64::consts::FRAC_PI_2) / std::f64::consts::PI).ceil() as i64;
                    let end =
                        ((a.1 - std::f64::consts::FRAC_PI_2) / std::f64::consts::PI).floor() as i64;
                    for k in start..=end {
                        let v = if k % 2 == 0 { 1. } else { -1. };
                        lo = lo.min(v);
                        hi = hi.max(v);
                    }
                    Interval::new(lo, hi)
                }
                _ => None,
            }
        }
        _ => None,
    }
}
