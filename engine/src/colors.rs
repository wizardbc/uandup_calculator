use crate::eval::Value;
use palette::{FromColor, Hsv, Okhsv, Oklab, Oklch, Srgb};
pub fn function(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    if !["rgb", "hsv", "okhsv", "oklab", "oklch"].contains(&name) {
        return None;
    }
    Some((|| {
        if args.len() != 3 {
            return Err("A color function takes three components.".into());
        }
        if args.iter().any(|v| matches!(v, Value::List(_))) {
            let n = args
                .iter()
                .filter_map(|v| {
                    if let Value::List(xs) = v {
                        Some(xs.len())
                    } else {
                        None
                    }
                })
                .min()
                .unwrap_or(0);
            return Ok(Value::List(
                (0..n)
                    .map(|i| {
                        let values: Vec<_> = args
                            .iter()
                            .map(|v| {
                                if let Value::List(xs) = v {
                                    xs[i].clone()
                                } else {
                                    v.clone()
                                }
                            })
                            .collect();
                        function(name, &values).unwrap()
                    })
                    .collect::<Result<_, _>>()?,
            ));
        }
        let [a, b, c] = [args[0].scalar()?, args[1].scalar()?, args[2].scalar()?];
        if ![a, b, c].iter().all(|x| x.is_finite()) {
            return Err("Color components must be finite.".into());
        }
        let rgb: Srgb<f64> = match name {
            "rgb" => Srgb::new(a / 255., b / 255., c / 255.),
            "hsv" => Srgb::from_color(Hsv::new(a, b.clamp(0., 1.), c.clamp(0., 1.))),
            "okhsv" => Srgb::from_color(Okhsv::new(a, b.clamp(0., 1.), c.clamp(0., 1.))),
            "oklab" => Srgb::from_color(Oklab::new(a.clamp(0., 1.), b, c)),
            _ => Srgb::from_color(Oklch::new(a.clamp(0., 1.), b.max(0.), c)),
        };
        Ok(Value::Color(format!(
            "#{:02x}{:02x}{:02x}",
            (rgb.red.clamp(0., 1.) * 255.).round() as u8,
            (rgb.green.clamp(0., 1.) * 255.).round() as u8,
            (rgb.blue.clamp(0., 1.) * 255.).round() as u8
        )))
    })())
}
