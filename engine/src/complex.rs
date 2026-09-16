use crate::eval::{Value, binary, number};
use num_complex::Complex64 as C;

pub fn value(z: C) -> Value {
    if !z.is_finite() {
        return Value::Scalar(f64::NAN);
    }
    if z.im == 0. {
        Value::Scalar(z.re)
    } else {
        Value::Complex(z)
    }
}
pub fn display(z: C) -> String {
    if !z.is_finite() {
        return "undefined".into();
    }
    let re = number(z.re);
    let im = number(z.im.abs());
    if im == "0" {
        return re;
    }
    let coefficient = if im == "1" { "" } else { &im };
    if re == "0" {
        format!("{}{coefficient}i", if z.im < 0. { "−" } else { "" })
    } else {
        format!("{re} {} {coefficient}i", if z.im < 0. { "−" } else { "+" })
    }
}
fn number_value(v: &Value) -> Result<C, String> {
    match v {
        Value::Scalar(x) => Ok(C::new(*x, 0.)),
        Value::Complex(z) => Ok(*z),
        _ => Err("A number is needed here.".into()),
    }
}
pub fn operation(op: &str, a: Value, b: Value) -> Result<Value, String> {
    match (&a, &b) {
        (Value::List(xs), Value::List(ys)) => {
            if xs.len() != ys.len() {
                return Err("These lists must have the same length.".into());
            }
            return Ok(Value::List(
                xs.iter()
                    .zip(ys)
                    .map(|(x, y)| operation(op, x.clone(), y.clone()))
                    .collect::<Result<_, _>>()?,
            ));
        }
        (Value::List(xs), _) => {
            return Ok(Value::List(
                xs.iter()
                    .map(|x| operation(op, x.clone(), b.clone()))
                    .collect::<Result<_, _>>()?,
            ));
        }
        (_, Value::List(ys)) => {
            return Ok(Value::List(
                ys.iter()
                    .map(|y| operation(op, a.clone(), y.clone()))
                    .collect::<Result<_, _>>()?,
            ));
        }
        (Value::Scalar(x), Value::Scalar(y)) if !(op == "^" && *x < 0. && y.fract() != 0.) => {
            return binary(op, a, b);
        }
        _ => (),
    }
    let x = number_value(&a)?;
    let y = number_value(&b)?;
    Ok(value(match op {
        "+" => x + y,
        "-" => x - y,
        "*" => x * y,
        "/" => {
            if y == C::new(0., 0.) {
                C::new(f64::NAN, 0.)
            } else {
                x / y
            }
        }
        "^" => {
            if y.im == 0. && y.re.fract() == 0. && y.re.abs() < i32::MAX as f64 {
                x.powi(y.re as i32)
            } else {
                x.powc(y)
            }
        }
        "=" => C::new((x == y) as u8 as f64, 0.),
        "!=" => C::new((x != y) as u8 as f64, 0.),
        _ => return Err("This operation is not defined for complex numbers.".into()),
    }))
}
pub fn function(name: &str, args: &[Value], degrees: bool) -> Option<Result<Value, String>> {
    if ![
        "real", "imag", "conj", "arg", "sqrt", "abs", "ln", "log", "exp", "sin", "cos", "tan",
        "csc", "sec", "cot", "arcsin", "arccos", "arctan", "arccsc", "arcsec", "arccot", "sinh",
        "cosh", "tanh", "csch", "sech", "coth", "arcsinh", "arccosh", "arctanh", "sign",
    ]
    .contains(&name)
    {
        return None;
    }
    Some((|| {
        if args.len() != 1 {
            return Err(format!("{name} takes one argument."));
        }
        if let Value::List(xs) = &args[0] {
            return Ok(Value::List(
                xs.iter()
                    .map(|x| function(name, &[x.clone()], degrees).unwrap())
                    .collect::<Result<_, _>>()?,
            ));
        }
        let z = number_value(&args[0])?;
        let angle = if degrees {
            std::f64::consts::PI / 180.
        } else {
            1.
        };
        let one = C::new(1., 0.);
        Ok(value(match name {
            "real" => C::new(z.re, 0.),
            "imag" => C::new(z.im, 0.),
            "conj" => z.conj(),
            "arg" => C::new(z.arg() / angle, 0.),
            "sqrt" => z.sqrt(),
            "abs" => C::new(z.norm(), 0.),
            "ln" => z.ln(),
            "log" => z.log10(),
            "exp" => z.exp(),
            "sin" => (z * angle).sin(),
            "cos" => (z * angle).cos(),
            "tan" => (z * angle).tan(),
            "csc" => one / (z * angle).sin(),
            "sec" => one / (z * angle).cos(),
            "cot" => one / (z * angle).tan(),
            "arcsin" => z.asin() / angle,
            "arccos" => z.acos() / angle,
            "arctan" => z.atan() / angle,
            "arccsc" => (one / z).asin() / angle,
            "arcsec" => (one / z).acos() / angle,
            "arccot" => (one / z).atan() / angle,
            "sinh" => z.sinh(),
            "cosh" => z.cosh(),
            "tanh" => z.tanh(),
            "csch" => one / z.sinh(),
            "sech" => one / z.cosh(),
            "coth" => one / z.tanh(),
            "arcsinh" => z.asinh(),
            "arccosh" => z.acosh(),
            "arctanh" => z.atanh(),
            _ => {
                if z.norm() == 0. {
                    C::new(0., 0.)
                } else {
                    z / z.norm()
                }
            }
        }))
    })())
}
