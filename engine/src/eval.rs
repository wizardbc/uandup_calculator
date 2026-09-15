use crate::parser::Expr;
use std::{cell::Cell, collections::HashMap};

#[derive(Clone, Debug)]
pub enum Value {
    Scalar(f64),
    List(Vec<Value>),
    Point(f64, f64),
    Distribution(String, Vec<f64>),
}
impl Value {
    pub fn scalar(&self) -> Result<f64, String> {
        if let Self::Scalar(x) = self {
            Ok(*x)
        } else {
            Err("A number is needed here.".into())
        }
    }
    pub fn numbers(&self) -> Result<Vec<f64>, String> {
        match self {
            Self::List(xs) => xs.iter().map(Value::scalar).collect(),
            Self::Scalar(x) => Ok(vec![*x]),
            _ => Err("A list of numbers is needed here.".into()),
        }
    }
    pub fn display(&self) -> String {
        match self {
            Self::Scalar(x) => number(*x),
            Self::Point(x, y) => format!("({}, {})", number(*x), number(*y)),
            Self::List(xs) => format!(
                "[{}{}]",
                xs.iter()
                    .take(20)
                    .map(Value::display)
                    .collect::<Vec<_>>()
                    .join(", "),
                if xs.len() > 20 { ", …" } else { "" }
            ),
            Self::Distribution(name, _) => name.replace("dist", " distribution"),
        }
    }
}
pub fn number(x: f64) -> String {
    if x.is_nan() {
        return "undefined".into();
    }
    if x.is_infinite() {
        return if x > 0. { "∞" } else { "−∞" }.into();
    }
    let x = if x == 0. { 0. } else { x };
    if x != 0. && (x.abs() >= 1e12 || x.abs() < 1e-7) {
        format!("{x:.9e}")
    } else {
        let s = format!("{x:.10}");
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

#[derive(Clone)]
pub enum Definition {
    Variable(Expr),
    Function(Vec<String>, Expr),
}
#[derive(Default)]
pub struct Environment {
    pub definitions: HashMap<String, Definition>,
    pub values: HashMap<String, Value>,
    pub degrees: bool,
    pub work: Cell<u64>,
}
impl Environment {
    pub fn eval(&self, e: &Expr, vars: &HashMap<String, Value>) -> Result<Value, String> {
        self.at(e, vars, 0)
    }
    pub fn at(
        &self,
        e: &Expr,
        vars: &HashMap<String, Value>,
        depth: usize,
    ) -> Result<Value, String> {
        let work = self.work.get() + 1;
        self.work.set(work);
        if work > 25_000_000 {
            return Err("This calculation is too complex. Try a smaller range.".into());
        }
        if depth > 64 {
            return Err("Circular definition or too many nested calls.".into());
        }
        let ev = |e: &Expr| self.at(e, vars, depth + 1);
        match e {
            Expr::Num(x) => Ok(Value::Scalar(*x)),
            Expr::Var(n) => {
                if let Some(v) = vars.get(n).or(self.values.get(n)) {
                    return Ok(v.clone());
                }
                match n.as_str() {
                    "pi" => return Ok(Value::Scalar(std::f64::consts::PI)),
                    "e" => return Ok(Value::Scalar(std::f64::consts::E)),
                    "infinity" => return Ok(Value::Scalar(f64::INFINITY)),
                    _ => (),
                }
                if let Some(Definition::Variable(expr)) = self.definitions.get(n) {
                    return ev(expr);
                }
                Err(format!("Define {n} to use it here."))
            }
            Expr::Unary(op, x) => unary(ev(x)?, &|x| if *op == '-' { -x } else { x }),
            Expr::Binary(op, a, b) => {
                if matches!(op.as_str(), "<" | ">" | "<=" | ">=") {
                    if let Expr::Binary(prev, left, middle) = a.as_ref() {
                        if matches!(prev.as_str(), "<" | ">" | "<=" | ">=") {
                            let first = binary(prev, ev(left)?, ev(middle)?)?;
                            let second = binary(op, ev(middle)?, ev(b)?)?;
                            return binary("and", first, second);
                        }
                    }
                }
                binary(op, ev(a)?, ev(b)?)
            }
            Expr::List(xs) => Ok(Value::List(xs.iter().map(ev).collect::<Result<_, _>>()?)),
            Expr::Point(a, b) => {
                let a = ev(a)?;
                let b = ev(b)?;
                match (&a, &b) {
                    (Value::Scalar(x), Value::Scalar(y)) => Ok(Value::Point(*x, *y)),
                    _ => {
                        let xs = a.numbers()?;
                        let ys = b.numbers()?;
                        if xs.is_empty() || ys.is_empty() {
                            return Ok(Value::List(vec![]));
                        }
                        let n = xs.len().max(ys.len());
                        if xs.len() != ys.len() && xs.len() != 1 && ys.len() != 1 {
                            return Err("These lists must have the same length.".into());
                        }
                        Ok(Value::List(
                            (0..n)
                                .map(|i| Value::Point(xs[i % xs.len()], ys[i % ys.len()]))
                                .collect(),
                        ))
                    }
                }
            }
            Expr::Range(a, b, second) => {
                let a = ev(a)?.scalar()?;
                let b = ev(b)?.scalar()?;
                let step = if let Some(s) = second {
                    ev(s)?.scalar()? - a
                } else {
                    1.
                };
                let n = ((b - a) / step + 1e-10).floor() + 1.;
                if !n.is_finite() || n > 10000. || step == 0. {
                    return Err("A list can have at most 10,000 elements.".into());
                }
                Ok(Value::List(
                    (0..n.max(0.) as usize)
                        .map(|i| Value::Scalar(a + i as f64 * step))
                        .collect(),
                ))
            }
            Expr::Index(list, index) => {
                let value = ev(list)?;
                if let Value::List(xs) = value {
                    let idx = ev(index)?;
                    let one = |n: f64| {
                        if n.is_finite() && n >= 1. && n <= xs.len() as f64 && n.fract() == 0. {
                            xs[n as usize - 1].clone()
                        } else {
                            Value::Scalar(f64::NAN)
                        }
                    };
                    match idx {
                        Value::Scalar(x) => Ok(one(x)),
                        Value::List(is) => Ok(Value::List(
                            is.iter()
                                .map(|v| v.scalar().map(one))
                                .collect::<Result<_, _>>()?,
                        )),
                        _ => Err("Use a positive integer index.".into()),
                    }
                } else {
                    Err("Only lists can be indexed.".into())
                }
            }
            Expr::Restrict(value, condition) => {
                let c = ev(condition)?;
                if c.scalar()? != 0. {
                    ev(value)
                } else {
                    Ok(Value::Scalar(f64::NAN))
                }
            }
            Expr::Piecewise(cases, fallback) => {
                for (condition, value) in cases {
                    if ev(condition)?.scalar()? != 0. {
                        return ev(value);
                    }
                }
                if let Some(x) = fallback {
                    ev(x)
                } else {
                    Ok(Value::Scalar(f64::NAN))
                }
            }
            Expr::Call(name, args) => {
                if let Some(Definition::Function(params, expr)) = self.definitions.get(name) {
                    if params.len() != args.len() {
                        return Err(format!("{name} needs {} argument(s).", params.len()));
                    }
                    let mut local = vars.clone();
                    for (p, a) in params.iter().zip(args) {
                        local.insert(p.clone(), ev(a)?);
                    }
                    return self.at(expr, &local, depth + 1);
                }
                if ["sum", "product", "integral", "derivative"].contains(&name.as_str()) {
                    return self.calculus(name, args, vars, depth);
                }
                let values = args.iter().map(ev).collect::<Result<Vec<_>, _>>()?;
                if let Some(base) = name.strip_prefix("log_") {
                    let b: f64 = base.parse().map_err(|_| "Use a numeric logarithm base.")?;
                    return unary(
                        values.first().ok_or("Enter a logarithm argument.")?.clone(),
                        &|x| x.log(b),
                    );
                }
                if let Some(v) = vars.get(name).or(self.values.get(name)) {
                    if values.len() == 1 {
                        return binary("*", v.clone(), values[0].clone());
                    }
                }
                self.function(name, &values)
            }
        }
    }
    fn calculus(
        &self,
        name: &str,
        args: &[Expr],
        vars: &HashMap<String, Value>,
        depth: usize,
    ) -> Result<Value, String> {
        if args.len() < 3 {
            return Err(format!(
                "Use {name}(expression, variable, value{}).",
                if name == "derivative" {
                    ""
                } else {
                    ", upper bound"
                }
            ));
        }
        let var = if let Expr::Var(n) = &args[1] {
            n.clone()
        } else {
            return Err("Choose a variable for this calculation.".into());
        };
        let lo = self.at(&args[2], vars, depth + 1)?.scalar()?;
        let mut local = vars.clone();
        let mut f = |x| {
            local.insert(var.clone(), Value::Scalar(x));
            self.at(&args[0], &local, depth + 1)?.scalar()
        };
        if name == "derivative" {
            let h = 1e-4 * (1. + lo.abs());
            return Ok(Value::Scalar(
                (-f(lo + 2. * h)? + 8. * f(lo + h)? - 8. * f(lo - h)? + f(lo - 2. * h)?)
                    / (12. * h),
            ));
        }
        let hi = self
            .at(args.get(3).ok_or("Enter an upper bound.")?, vars, depth + 1)?
            .scalar()?;
        if !lo.is_finite() || !hi.is_finite() {
            return Err("Use finite bounds.".into());
        }
        if name == "sum" || name == "product" {
            if hi - lo > 10000. || lo.fract() != 0. || hi.fract() != 0. {
                return Err("Use integer bounds with at most 10,000 terms.".into());
            }
            let mut total = if name == "sum" { 0. } else { 1. };
            for i in (lo as i64)..=(hi as i64) {
                let v = f(i as f64)?;
                if name == "sum" {
                    total += v;
                } else {
                    total *= v;
                }
            }
            return Ok(Value::Scalar(total));
        }
        fn integrate(
            f: &mut impl FnMut(f64) -> Result<f64, String>,
            a: f64,
            b: f64,
            fa: f64,
            fm: f64,
            fb: f64,
            s: f64,
            tol: f64,
            depth: u32,
        ) -> Result<f64, String> {
            let m = (a + b) / 2.;
            let l = f((a + m) / 2.)?;
            let r = f((m + b) / 2.)?;
            let sl = (m - a) * (fa + 4. * l + fm) / 6.;
            let sr = (b - m) * (fm + 4. * r + fb) / 6.;
            let delta = sl + sr - s;
            if depth == 0 || delta.abs() < 15. * tol {
                return Ok(sl + sr + delta / 15.);
            }
            Ok(integrate(f, a, m, fa, l, fm, sl, tol / 2., depth - 1)?
                + integrate(f, m, b, fm, r, fb, sr, tol / 2., depth - 1)?)
        }
        let fa = f(lo)?;
        let fb = f(hi)?;
        let fm = f((lo + hi) / 2.)?;
        let s = (hi - lo) * (fa + 4. * fm + fb) / 6.;
        let answer = integrate(&mut f, lo, hi, fa, fm, fb, s, 1e-9, 16)?;
        Ok(Value::Scalar(answer))
    }
    fn function(&self, name: &str, args: &[Value]) -> Result<Value, String> {
        if name.ends_with("dist") {
            let params = args
                .iter()
                .map(Value::scalar)
                .collect::<Result<Vec<_>, _>>()?;
            crate::distributions::evaluate(name, &params, "cdf", 0.)?;
            return Ok(Value::Distribution(name.into(), params));
        }
        if ["pdf", "cdf", "inversecdf"].contains(&name) {
            return crate::distributions::member(name, args);
        }
        if args.is_empty() {
            return Err(format!("Enter an argument for {name}."));
        }
        let factor = if self.degrees {
            std::f64::consts::PI / 180.
        } else {
            1.
        };
        let one: Option<fn(f64) -> f64> = match name {
            "sqrt" => Some(f64::sqrt),
            "abs" => Some(f64::abs),
            "ln" => Some(f64::ln),
            "log" => Some(f64::log10),
            "exp" => Some(f64::exp),
            "floor" => Some(f64::floor),
            "ceil" => Some(f64::ceil),
            "sinh" => Some(f64::sinh),
            "cosh" => Some(f64::cosh),
            "tanh" => Some(f64::tanh),
            "arcsinh" => Some(f64::asinh),
            "arccosh" => Some(f64::acosh),
            "arctanh" => Some(f64::atanh),
            "sign" => Some(|x| if x == 0. { 0. } else { x.signum() }),
            "factorial" => Some(factorial),
            _ => None,
        };
        if let Some(f) = one {
            if args.len() != 1 {
                return Err(format!("{name} takes one argument."));
            }
            return unary(args[0].clone(), &f);
        }
        if [
            "sin", "cos", "tan", "sec", "csc", "cot", "arcsin", "arccos", "arctan", "arcsec",
            "arccsc", "arccot",
        ]
        .contains(&name)
        {
            if args.len() != 1 {
                return Err(format!("{name} takes one argument."));
            }
            return unary(args[0].clone(), &|x| match name {
                "sin" => (x * factor).sin(),
                "cos" => (x * factor).cos(),
                "tan" => {
                    let a = x * factor;
                    if a.cos().abs() < 1e-15 {
                        f64::NAN
                    } else {
                        a.tan()
                    }
                }
                "sec" => 1. / (x * factor).cos(),
                "csc" => 1. / (x * factor).sin(),
                "cot" => 1. / (x * factor).tan(),
                "arcsin" => x.asin() / factor,
                "arccos" => x.acos() / factor,
                "arctan" => x.atan() / factor,
                "arcsec" => (1. / x).acos() / factor,
                "arccsc" => (1. / x).asin() / factor,
                _ => (1. / x).atan() / factor,
            });
        }
        if name == "round" {
            let digits = if args.len() > 1 {
                args[1].scalar()?
            } else {
                0.
            };
            return unary(args[0].clone(), &|x| {
                let s = 10f64.powf(digits);
                (x * s).round() / s
            });
        }
        if name == "root" || name == "mod" {
            if args.len() != 2 {
                return Err(format!("{name} takes two arguments."));
            }
            return binary(
                if name == "root" { "root" } else { "mod" },
                args[0].clone(),
                args[1].clone(),
            );
        }
        if name == "nCr" || name == "nPr" {
            if args.len() != 2 {
                return Err("Enter n and r.".into());
            }
            let n = args[0].scalar()?;
            let k = args[1].scalar()?;
            if n.fract() != 0. || k.fract() != 0. || k < 0. || n < k || n > 10000. {
                return Ok(Value::Scalar(f64::NAN));
            }
            let k = if name == "nCr" { k.min(n - k) } else { k };
            let mut ans = 1.;
            for i in 0..k as usize {
                ans *= n - i as f64;
                if name == "nCr" {
                    ans /= (i + 1) as f64;
                }
            }
            return Ok(Value::Scalar(ans));
        }
        let mut xs = Vec::new();
        for a in args {
            xs.extend(a.numbers()?);
        }
        if xs.len() > 10000 {
            return Err("This list is too long.".into());
        }
        let n = xs.len() as f64;
        let mean = xs.iter().sum::<f64>() / n;
        let scalar = match name {
            "total" => xs.iter().sum(),
            "mean" => mean,
            "length" | "count" => n,
            "min" => xs.iter().copied().reduce(f64::min).unwrap_or(f64::NAN),
            "max" => xs.iter().copied().reduce(f64::max).unwrap_or(f64::NAN),
            "stdev" | "stdevp" | "var" | "variance" => {
                let sum = xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>();
                let v = if n > if name == "stdevp" { 0. } else { 1. } {
                    sum / (n - if name == "stdevp" { 0. } else { 1. })
                } else {
                    f64::NAN
                };
                if name.starts_with("stdev") {
                    v.sqrt()
                } else {
                    v
                }
            }
            "mad" => xs.iter().map(|x| (x - mean).abs()).sum::<f64>() / n,
            "median" => {
                xs.sort_by(f64::total_cmp);
                if xs.is_empty() {
                    f64::NAN
                } else {
                    (xs[(xs.len() - 1) / 2] + xs[xs.len() / 2]) / 2.
                }
            }
            "quantile" => {
                if args.len() != 2 {
                    return Err("Use quantile(list, probability).".into());
                }
                let mut data = args[0].numbers()?;
                let p = args[1].scalar()?;
                if !(0. ..=1.).contains(&p) || data.is_empty() {
                    f64::NAN
                } else {
                    data.sort_by(f64::total_cmp);
                    let at = p * (data.len() - 1) as f64;
                    let i = at.floor() as usize;
                    data[i] + (data[at.ceil() as usize] - data[i]) * (at - i as f64)
                }
            }
            "sort" | "unique" | "join" => {
                if name != "join" {
                    xs.sort_by(f64::total_cmp);
                }
                if name == "unique" {
                    xs.dedup();
                }
                return Ok(Value::List(xs.into_iter().map(Value::Scalar).collect()));
            }
            "gcd" | "lcm" => {
                if xs.iter().any(|x| x.fract() != 0. || x.abs() > 1e12) {
                    f64::NAN
                } else {
                    let gcd = |a: f64, b: f64| {
                        let (mut a, mut b) = (a.abs() as u64, b.abs() as u64);
                        while b != 0 {
                            (a, b) = (b, a % b);
                        }
                        a as f64
                    };
                    xs.into_iter()
                        .reduce(|a, b| {
                            let g = gcd(a, b);
                            if name == "gcd" {
                                g
                            } else if g == 0. {
                                0.
                            } else {
                                (a / g * b).abs()
                            }
                        })
                        .unwrap_or(0.)
                }
            }
            "cov" | "corr" => {
                if args.len() != 2 {
                    return Err("Use two lists of equal length.".into());
                }
                let a = args[0].numbers()?;
                let b = args[1].numbers()?;
                if a.len() != b.len() || a.len() < 2 {
                    return Err("Use two lists of equal length.".into());
                }
                let ma = a.iter().sum::<f64>() / a.len() as f64;
                let mb = b.iter().sum::<f64>() / b.len() as f64;
                let cross = a
                    .iter()
                    .zip(&b)
                    .map(|(x, y)| (x - ma) * (y - mb))
                    .sum::<f64>();
                if name == "cov" {
                    cross / (a.len() - 1) as f64
                } else {
                    cross
                        / (a.iter().map(|x| (x - ma).powi(2)).sum::<f64>()
                            * b.iter().map(|y| (y - mb).powi(2)).sum::<f64>())
                        .sqrt()
                }
            }
            _ => return Err(format!("The function {name} isn't defined.")),
        };
        Ok(Value::Scalar(scalar))
    }
}

pub fn factorial(x: f64) -> f64 {
    if x < 0. || x.fract() != 0. {
        f64::NAN
    } else if x > 170. {
        f64::INFINITY
    } else {
        (1..=x as u64).fold(1., |a, b| a * b as f64)
    }
}
pub fn unary(v: Value, f: &dyn Fn(f64) -> f64) -> Result<Value, String> {
    match v {
        Value::Scalar(x) => Ok(Value::Scalar(f(x))),
        Value::List(xs) => Ok(Value::List(
            xs.into_iter()
                .map(|x| unary(x, f))
                .collect::<Result<_, _>>()?,
        )),
        _ => Err("This operation needs numbers.".into()),
    }
}
pub fn binary(op: &str, a: Value, b: Value) -> Result<Value, String> {
    match (a, b) {
        (Value::Scalar(x), Value::Scalar(y)) => Ok(Value::Scalar(match op {
            "+" => x + y,
            "-" => x - y,
            "*" => x * y,
            "/" => {
                if y == 0. {
                    f64::NAN
                } else {
                    x / y
                }
            }
            "^" => x.powf(y),
            "root" => {
                if y == 0. {
                    f64::NAN
                } else if x < 0. && y.fract() == 0. && y % 2. != 0. {
                    -(-x).powf(1. / y)
                } else {
                    x.powf(1. / y)
                }
            }
            "mod" => x.rem_euclid(y),
            "=" => (x == y) as u8 as f64,
            "!=" => (x != y) as u8 as f64,
            "<" => (x < y) as u8 as f64,
            ">" => (x > y) as u8 as f64,
            "<=" => (x <= y) as u8 as f64,
            ">=" => (x >= y) as u8 as f64,
            "and" => (x != 0. && y != 0.) as u8 as f64,
            _ => return Err("This operation isn't supported here.".into()),
        })),
        (Value::List(a), Value::List(b)) => {
            if a.len() != b.len() {
                return Err("These lists must have the same length.".into());
            }
            Ok(Value::List(
                a.into_iter()
                    .zip(b)
                    .map(|(a, b)| binary(op, a, b))
                    .collect::<Result<_, _>>()?,
            ))
        }
        (Value::List(a), b) => Ok(Value::List(
            a.into_iter()
                .map(|a| binary(op, a, b.clone()))
                .collect::<Result<_, _>>()?,
        )),
        (a, Value::List(b)) => Ok(Value::List(
            b.into_iter()
                .map(|b| binary(op, a.clone(), b))
                .collect::<Result<_, _>>()?,
        )),
        (Value::Point(x, y), Value::Point(a, b)) if op == "+" || op == "-" => {
            let s = if op == "+" { 1. } else { -1. };
            Ok(Value::Point(x + s * a, y + s * b))
        }
        _ => Err("This operation needs compatible numbers or lists.".into()),
    }
}
