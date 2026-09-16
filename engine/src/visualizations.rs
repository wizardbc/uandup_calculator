use crate::{
    eval::Value,
    plot::{self, Geometry, Viewport},
    statistics,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Visual {
    pub kind: String,
    pub data: Vec<f64>,
    pub width: f64,
    pub vertices: Vec<[f64; 2]>,
}
#[derive(Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Options {
    pub histogram_mode: String,
    pub bin_alignment: String,
    pub box_offset: Option<String>,
    pub box_height: Option<String>,
    pub show_outliers: Option<bool>,
}
pub fn function(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    if !["histogram", "dotplot", "boxplot", "polygon"].contains(&name) {
        return None;
    }
    Some((|| {
        if name == "polygon" {
            let values = if args.len() == 1 {
                if let Value::List(xs) = &args[0] {
                    xs.clone()
                } else {
                    args.to_vec()
                }
            } else {
                args.to_vec()
            };
            let vertices = values
                .iter()
                .map(|v| {
                    if let Value::Point(x, y) = v {
                        if (x + y).is_finite() {
                            Ok([*x, *y])
                        } else {
                            Err("Use finite points.")
                        }
                    } else {
                        Err("A polygon needs points.")
                    }
                })
                .collect::<Result<Vec<_>, _>>()?;
            if vertices.len() < 3 || vertices.len() > 10000 {
                return Err("Use at least three points for a polygon.".into());
            }
            return Ok(Value::Visual(Visual {
                kind: name.into(),
                data: vec![],
                width: 1.,
                vertices,
            }));
        }
        if args.is_empty() || args.len() > if name == "boxplot" { 1 } else { 2 } {
            return Err("Enter a data list and optional bin width.".into());
        }
        let data = args[0].numbers()?;
        let width = if args.len() == 2 {
            args[1].scalar()?
        } else {
            1.
        };
        if data.len() > 10000
            || data.iter().any(|x| !x.is_finite())
            || !width.is_finite()
            || width <= 0.
        {
            return Err("Use finite data and a positive bin width.".into());
        }
        Ok(Value::Visual(Visual {
            kind: name.into(),
            data,
            width,
            vertices: vec![],
        }))
    })())
}
pub fn geometry(
    v: &Visual,
    options: &Options,
    _viewport: Viewport,
    offset: f64,
    height: f64,
    buffer: &mut Vec<f64>,
) -> Vec<Geometry> {
    let mut geometries = vec![];
    let mut fill = vec![];
    let mut lines = vec![];
    let mut points = vec![];
    let segment = |lines: &mut Vec<[f64; 2]>, a: [f64; 2], b: [f64; 2]| {
        lines.extend([a, b]);
    };
    let rect =
        |fill: &mut Vec<[f64; 2]>, lines: &mut Vec<[f64; 2]>, x: f64, y: f64, w: f64, h: f64| {
            let [a, b, c, d] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
            fill.extend([a, b, c, a, c, d]);
            lines.extend([a, b, b, c, c, d, d, a]);
        };
    if v.kind == "polygon" {
        // Ear clipping retains concave polygon interiors. Intersecting outlines have
        // a well-defined stroke; only nonintersecting ears are filled.
        let vertices = &v.vertices;
        let n = vertices.len();
        for i in 0..n {
            segment(&mut lines, vertices[i], vertices[(i + 1) % n]);
        }
        let area = vertices
            .iter()
            .enumerate()
            .map(|(i, a)| {
                let b = vertices[(i + 1) % n];
                a[0] * b[1] - b[0] * a[1]
            })
            .sum::<f64>();
        let cross = |a: [f64; 2], b: [f64; 2], c: [f64; 2]| {
            (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        };
        let sign = area.signum();
        let mut order: Vec<_> = (0..n).collect();
        let mut budget = 0;
        while order.len() > 2 && budget < 1000000 {
            let mut clipped = false;
            for i in 0..order.len() {
                budget += 1;
                let ia = order[(i + order.len() - 1) % order.len()];
                let ib = order[i];
                let ic = order[(i + 1) % order.len()];
                let (a, b, c) = (vertices[ia], vertices[ib], vertices[ic]);
                if cross(a, b, c) * sign <= 0. {
                    continue;
                }
                let contains = order.iter().any(|&j| {
                    if j == ia || j == ib || j == ic {
                        return false;
                    }
                    let p = vertices[j];
                    cross(a, b, p) * sign >= 0.
                        && cross(b, c, p) * sign >= 0.
                        && cross(c, a, p) * sign >= 0.
                });
                if contains {
                    continue;
                }
                fill.extend([a, b, c]);
                order.remove(i);
                clipped = true;
                break;
            }
            if !clipped {
                break;
            }
        }
    } else if v.kind == "boxplot" {
        if v.data.is_empty() {
            return geometries;
        }
        let mut xs = v.data.clone();
        xs.sort_by(f64::total_cmp);
        let q1 = statistics::quartile(&xs, 1);
        let q3 = statistics::quartile(&xs, 3);
        let med = statistics::median(&xs);
        let iqr = q3 - q1;
        let dots = options.show_outliers.unwrap_or(true);
        let lo = if dots {
            xs.iter()
                .copied()
                .find(|x| *x >= q1 - 1.5 * iqr)
                .unwrap_or(xs[0])
        } else {
            xs[0]
        };
        let hi = if dots {
            xs.iter()
                .rev()
                .copied()
                .find(|x| *x <= q3 + 1.5 * iqr)
                .unwrap_or(*xs.last().unwrap())
        } else {
            *xs.last().unwrap()
        };
        let bottom = offset - height / 2.;
        rect(&mut fill, &mut lines, q1, bottom, q3 - q1, height);
        fill.clear();
        segment(&mut lines, [med, bottom], [med, bottom + height]);
        segment(&mut lines, [lo, offset], [q1, offset]);
        segment(&mut lines, [q3, offset], [hi, offset]);
        for x in [lo, hi] {
            segment(
                &mut lines,
                [x, offset - height / 4.],
                [x, offset + height / 4.],
            );
        }
        if dots {
            points.extend(
                xs.into_iter()
                    .filter(|x| *x < lo || *x > hi)
                    .map(|x| [x, offset]),
            );
        }
    } else {
        let left = options.bin_alignment == "left";
        let mut bins = BTreeMap::<i64, usize>::new();
        for &x in &v.data {
            let n = (x / v.width + if left { 0. } else { 0.5 }).floor();
            if n.abs() > i64::MAX as f64 {
                continue;
            }
            *bins.entry(n as i64).or_default() += 1;
        }
        for (bin, count) in bins {
            let x = (bin as f64 - if left { 0. } else { 0.5 }) * v.width;
            if v.kind == "histogram" {
                let h = count as f64
                    / match options.histogram_mode.as_str() {
                        "relative" => v.data.len() as f64,
                        "density" => v.data.len() as f64 * v.width,
                        _ => 1.,
                    };
                rect(&mut fill, &mut lines, x, 0., v.width, h);
            } else {
                for i in 0..count {
                    points.push([x + v.width / 2., i as f64 + 1.]);
                }
            }
        }
    }
    if !fill.is_empty() {
        geometries.push(plot::push(buffer, fill.as_flattened(), "triangles", false));
    }
    if !lines.is_empty() {
        geometries.push(plot::push(buffer, lines.as_flattened(), "segments", false));
    }
    if !points.is_empty() {
        geometries.push(plot::push(buffer, points.as_flattened(), "points", false));
    }
    geometries
}
