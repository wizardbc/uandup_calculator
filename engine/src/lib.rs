mod colors;
mod compiled;
mod complex;
mod distribution_view;
mod distributions;
mod eval;
mod inference;
mod intersections;
mod interval;
mod parser;
mod plot;
mod random;
mod regression;
mod statistics;
mod visualizations;

use eval::{Definition, Environment, Value};
use parser::Expr;
use plot::{Geometry, Interest, Viewport};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputRow {
    id: String,
    latex: String,
    #[serde(default)]
    hidden: bool,
    #[serde(default)]
    auxiliary: bool,
    #[serde(default)]
    log_mode: Option<bool>,
    #[serde(default)]
    inference_level: Option<String>,
    #[serde(default)]
    inference_null: Option<String>,
    #[serde(default)]
    visualization: visualizations::Options,
    #[serde(default)]
    distribution: distribution_view::Options,
    #[serde(default)]
    color_latex: Option<String>,
    #[serde(default)]
    domain_min: Option<String>,
    #[serde(default)]
    domain_max: Option<String>,
    #[serde(default)]
    plot_style: HashMap<String, serde_json::Value>,
    #[serde(default)]
    regression_parameters: Vec<String>,
    #[serde(default)]
    residual_variable: Option<String>,
    #[serde(default)]
    slider_min: Option<f64>,
    #[serde(default)]
    slider_max: Option<f64>,
    #[serde(default)]
    slider_step: Option<f64>,
    #[serde(default)]
    slider_min_latex: Option<String>,
    #[serde(default)]
    slider_max_latex: Option<String>,
    #[serde(default)]
    slider_step_latex: Option<String>,
}
#[derive(Deserialize)]
struct Request {
    expressions: Vec<InputRow>,
    viewport: Viewport,
    #[serde(default)]
    degrees: bool,
    #[serde(default)]
    scientific: bool,
    #[serde(default)]
    complex: bool,
    #[serde(default, rename = "randomSeed")]
    random_seed: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RowResult {
    id: String,
    kind: String,
    display: Option<String>,
    value: Option<f64>,
    error: Option<String>,
    missing: Vec<String>,
    slider: Option<String>,
    slider_bounds: Option<SliderBounds>,
    geometry: Vec<Geometry>,
    points: Vec<Interest>,
    fit: Option<regression::Fit>,
    inference: Option<inference::Test>,
    inference_chart: Vec<[f64; 2]>,
    statistics: Option<statistics::Statistics>,
    visualization: Option<visualizations::Visual>,
    distribution: Option<distribution_view::View>,
    colors: Vec<String>,
    color_name: Option<String>,
    stroke_colors: Vec<String>,
    tones: Vec<[f64; 2]>,
    domain: Option<Domain>,
    style_values: HashMap<String, Vec<f64>>,
    label: String,
    drag: [Option<DragTarget>; 2],
    default_drag_mode: String,
    list_values: Option<Vec<String>>,
    point_drag: Vec<[Option<DragTarget>; 2]>,
    list_length: Option<usize>,
    list_literal: bool,
    residual_variable: Option<String>,
    regression_x: Option<String>,
}
impl RowResult {
    fn new(id: String) -> Self {
        Self {
            id,
            kind: "empty".into(),
            display: None,
            value: None,
            error: None,
            missing: vec![],
            slider: None,
            slider_bounds: None,
            geometry: vec![],
            points: vec![],
            fit: None,
            inference: None,
            inference_chart: vec![],
            statistics: None,
            visualization: None,
            distribution: None,
            colors: vec![],
            color_name: None,
            stroke_colors: vec![],
            tones: vec![],
            domain: None,
            style_values: HashMap::new(),
            label: String::new(),
            drag: [None, None],
            default_drag_mode: "none".into(),
            list_values: None,
            point_drag: vec![],
            list_length: None,
            list_literal: false,
            residual_variable: None,
            regression_x: None,
        }
    }
}
#[derive(Serialize)]
struct SliderBounds {
    min: f64,
    max: f64,
    step: Option<f64>,
    error: Option<String>,
}
#[derive(Serialize)]
struct Domain {
    variable: String,
    min: String,
    max: String,
}
#[derive(Serialize)]
struct DragTarget {
    id: String,
    coordinate: Option<usize>,
    list_index: Option<usize>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    rows: Vec<RowResult>,
    evaluations: u64,
    engine: &'static str,
}

#[wasm_bindgen]
pub struct CalculatorEngine {
    cache: HashMap<String, Result<Expr, String>>,
    geometry: Vec<f64>,
}
impl Default for CalculatorEngine {
    fn default() -> Self {
        Self::new()
    }
}
#[wasm_bindgen]
impl CalculatorEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
            geometry: vec![],
        }
    }
    pub fn take_geometry(&mut self) -> Vec<f64> {
        std::mem::take(&mut self.geometry)
    }
    pub fn calculate(&mut self, input: &str) -> String {
        self.geometry.clear();
        let result = self.run(input);
        match result {
            Ok(response) => serde_json::to_string(&response)
                .unwrap_or_else(|_| "{\"error\":\"Unable to represent this result.\"}".into()),
            Err(e) => serde_json::json!({"error":e}).to_string(),
        }
    }
}
impl CalculatorEngine {
    fn run(&mut self, input: &str) -> Result<Response, String> {
        if input.len() > 1_000_000 {
            return Err("The calculator state is too large.".into());
        }
        let req: Request =
            serde_json::from_str(input).map_err(|_| "Invalid calculation request.")?;
        if req.expressions.len() > 150 || !req.viewport.valid() {
            return Err("Invalid expressions or graph bounds.".into());
        }
        if self.cache.len() > 400 {
            self.cache.clear();
        }
        let mut parsed: Vec<_> = req
            .expressions
            .iter()
            .map(|row| {
                if row.latex.trim().is_empty() {
                    None
                } else {
                    Some(
                        self.cache
                            .entry(row.latex.clone())
                            .or_insert_with(|| parser::parse(&row.latex))
                            .clone(),
                    )
                }
            })
            .collect();
        // Parentheses after a coefficient mean multiplication, while declared
        // functions consume their argument before an outside power is applied.
        let functions: BTreeSet<String> = parsed
            .iter()
            .flatten()
            .flatten()
            .filter_map(|ast| match ast {
                Expr::Binary(op, lhs, _) if op == "=" => match lhs.as_ref() {
                    Expr::Call(name, args)
                        if args.iter().all(|arg| matches!(arg, Expr::Var(_))) =>
                    {
                        Some(name.clone())
                    }
                    _ => None,
                },
                _ => None,
            })
            .collect();
        let context = functions.iter().cloned().collect::<Vec<_>>().join(",");
        for (row, ast) in req.expressions.iter().zip(&mut parsed) {
            if ast.is_some() {
                *ast = Some(
                    self.cache
                        .entry(format!("{context}\0{}", row.latex))
                        .or_insert_with(|| {
                            parser::parse_with_functions(&row.latex, Some(&functions))
                        })
                        .clone(),
                );
            }
        }
        let mut env = Environment {
            degrees: req.degrees,
            complex: req.complex,
            random_seed: req.random_seed,
            ..Default::default()
        };
        let empty = HashMap::new();
        let mut duplicate = BTreeSet::new();
        for ast in parsed.iter().flatten().flatten() {
            if let Expr::Binary(op, lhs, rhs) = ast {
                if op == "=" {
                    match lhs.as_ref() {
                        Expr::Var(n)
                            if !["x", "y"].contains(&n.as_str())
                                && !(n == "r" && rhs.variables().contains("theta")) =>
                        {
                            if env
                                .definitions
                                .insert(n.clone(), Definition::Variable(*rhs.clone()))
                                .is_some()
                            {
                                duplicate.insert(n.clone());
                            }
                        }
                        Expr::Call(n, args) if !parser::builtin(n) => {
                            let vars: Option<Vec<_>> = args
                                .iter()
                                .map(|a| {
                                    if let Expr::Var(n) = a {
                                        Some(n.clone())
                                    } else {
                                        None
                                    }
                                })
                                .collect();
                            if let Some(vars) = vars {
                                if env
                                    .definitions
                                    .insert(n.clone(), Definition::Function(vars, *rhs.clone()))
                                    .is_some()
                                {
                                    duplicate.insert(n.clone());
                                }
                            }
                        }
                        _ => (),
                    }
                }
            }
        }
        // Resolve constants and list columns once, retaining definitions for dependency evaluation.
        for _ in 0..req.expressions.len().min(32) {
            let mut changed = false;
            for name in env.definitions.keys().cloned().collect::<Vec<_>>() {
                if env.values.contains_key(&name) || duplicate.contains(&name) {
                    continue;
                }
                if let Some(Definition::Variable(expr)) = env.definitions.get(&name) {
                    env.random_context.set(random::hash(&name));
                    if let Ok(v) = env.eval(expr, &empty) {
                        env.values.insert(name, v);
                        changed = true;
                    }
                }
            }
            if !changed {
                break;
            }
        }
        let mut fits = HashMap::new();
        let mut regression_index = 0;
        let mut residual_names = HashMap::new();
        let mut used_residual_names: std::collections::HashSet<String> = env
            .definitions
            .keys()
            .chain(env.values.keys())
            .cloned()
            .collect();
        for source in &req.expressions {
            if let Some(latex) = &source.residual_variable {
                if let Ok(Expr::Var(name)) = parser::parse(latex) {
                    used_residual_names.insert(name);
                }
            }
        }
        for (i, ast) in parsed.iter().enumerate() {
            if let Some(Ok(Expr::Binary(op, a, b))) = ast {
                if op == "~" {
                    let source = &req.expressions[i];
                    let residual_name = source
                        .residual_variable
                        .clone()
                        .filter(|name| !name.trim().is_empty())
                        .unwrap_or_else(|| {
                            loop {
                                regression_index += 1;
                                if used_residual_names.insert(format!("e_{regression_index}")) {
                                    break format!("e_{{{regression_index}}}");
                                }
                            }
                        });
                    residual_names.insert(i, residual_name.clone());
                    let mut fit_env = env.clone();
                    for n in &source.regression_parameters {
                        fit_env.values.remove(n);
                        fit_env.definitions.remove(n);
                    }
                    let result = regression::fit(&fit_env, a, b, source.log_mode);
                    if let Ok(f) = &result {
                        if source.regression_parameters.is_empty() {
                            for (k, v) in &f.parameters {
                                env.values.insert(k.clone(), Value::Scalar(*v));
                                if let Some(se) = f.standard_errors.get(k) {
                                    if let Ok(test) = inference::Test::normal(
                                        "ttest",
                                        *v,
                                        *se,
                                        Some(f.degrees_of_freedom as f64),
                                    ) {
                                        env.regression_tests.insert(k.clone(), test);
                                    }
                                }
                            }
                        }
                        {
                            let latex = &residual_name;
                            if let Ok(Expr::Var(name)) = parser::parse(latex) {
                                env.values.insert(
                                    name,
                                    Value::List(
                                        f.residuals.iter().map(|n| Value::Scalar(*n)).collect(),
                                    ),
                                );
                            }
                        }
                    }
                    fits.insert(i, result);
                }
            }
        }
        let mut rows = vec![];
        let mut curves: Vec<(usize, Expr)> = vec![];
        for (i, row) in req.expressions.iter().enumerate() {
            env.random_context.set(random::hash(&row.id));
            let mut result = RowResult::new(row.id.clone());
            for key in [
                "pointSize",
                "pointOpacity",
                "lineWidth",
                "lineOpacity",
                "fillOpacity",
                "labelSize",
                "labelAngle",
            ] {
                if let Some(latex) = row.plot_style.get(key).and_then(|v| v.as_str()) {
                    if let Ok(v) = parser::parse(latex)
                        .and_then(|e| env.eval(&e, &empty))
                        .and_then(|v| v.numbers())
                    {
                        result.style_values.insert(
                            key.into(),
                            v.into_iter()
                                .map(|n| if n.is_finite() { n } else { 0. })
                                .collect(),
                        );
                    }
                }
            }
            if let Some(label) = row.plot_style.get("label").and_then(|v| v.as_str()) {
                let mut rest = label;
                while let Some(start) = rest.find("${") {
                    result.label.push_str(&rest[..start]);
                    let value = &rest[start + 2..];
                    let Some(end) = value.find('}') else { break };
                    let formatted = parser::parse(&value[..end])
                        .and_then(|e| env.eval(&e, &empty))
                        .map(|v| v.display())
                        .unwrap_or_else(|_| "undefined".into());
                    result.label.push_str(&formatted);
                    rest = &value[end + 1..];
                }
                result.label.push_str(rest);
            }
            if let Some(Ok(Expr::Binary(op, lhs, _))) = &parsed[i] {
                if op == "=" {
                    if let Expr::Var(name) = lhs.as_ref() {
                        env.random_context.set(random::hash(name));
                    }
                }
            }
            if let Some(latex) = &row.color_latex {
                if let Ok(v) = parser::parse(latex).and_then(|expr| env.eval(&expr, &empty)) {
                    result.stroke_colors = match v {
                        Value::Color(c) => vec![c],
                        Value::List(xs) => xs
                            .into_iter()
                            .filter_map(|v| {
                                if let Value::Color(c) = v {
                                    Some(c)
                                } else {
                                    None
                                }
                            })
                            .collect(),
                        _ => vec![],
                    };
                }
            }
            let ast = match &parsed[i] {
                None => {
                    rows.push(result);
                    continue;
                }
                Some(Err(e)) => {
                    result.error = Some(e.clone());
                    result.kind = "error".into();
                    rows.push(result);
                    continue;
                }
                Some(Ok(x)) => x,
            };
            if let Some(fit) = fits.remove(&i) {
                match fit {
                    Ok(f) => {
                        result.kind = "regression".into();
                        result.fit = Some(f.clone());
                        result.residual_variable = residual_names.get(&i).cloned();
                        if let Expr::Binary(_, _, rhs) = ast {
                            result.regression_x = rhs
                                .variables()
                                .into_iter()
                                .find(|n| matches!(env.values.get(n), Some(Value::List(_))))
                                .map(|n| {
                                    if let Some((a, b)) = n.split_once('_') {
                                        format!("{a}_{{{b}}}")
                                    } else {
                                        n
                                    }
                                });
                        }
                        if !row.hidden {
                            if let Expr::Binary(_, _, rhs) = ast {
                                let lists: Vec<_> = rhs
                                    .variables()
                                    .into_iter()
                                    .filter(|n| matches!(env.values.get(n), Some(Value::List(_))))
                                    .collect();
                                if lists.len() == 1 {
                                    let mut curve =
                                        rhs.substitute(&lists[0], &Expr::Var("x".into()));
                                    for (name, value) in &f.parameters {
                                        curve = curve.substitute(name, &Expr::Num(*value));
                                    }
                                    let (g, p) = plot::explicit(
                                        &env,
                                        &curve,
                                        req.viewport,
                                        false,
                                        &mut self.geometry,
                                    );
                                    result.geometry = g;
                                    result.points = p;
                                    curves.push((rows.len(), curve));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        result.kind = "error".into();
                        result.error = Some(e);
                    }
                }
                rows.push(result);
                continue;
            }
            let mut value_expr = ast;
            let mut is_definition = false;
            if let Expr::Binary(op, lhs, rhs) = ast {
                if op == "=" {
                    match lhs.as_ref() {
                        Expr::Var(n)
                            if !["x", "y"].contains(&n.as_str())
                                && !(n == "r" && rhs.variables().contains("theta")) =>
                        {
                            is_definition = true;
                            value_expr = rhs;
                            if duplicate.contains(n) {
                                result.error = Some(format!("{n} is defined more than once."));
                            }
                            if matches!(rhs.as_ref(), Expr::Num(_) | Expr::Unary(_, _)) {
                                if env.eval(rhs, &empty).and_then(|v| v.scalar()).is_ok() {
                                    result.slider = Some(n.clone());
                                }
                            }
                        }
                        Expr::Call(n, params) if !parser::builtin(n) => {
                            is_definition = true;
                            value_expr = rhs;
                            if duplicate.contains(n) {
                                result.error = Some(format!("{n} is defined more than once."));
                            }
                            if params.len() == 1 {
                                if let Expr::Var(v) = &params[0] {
                                    let call = Expr::Call(n.clone(), vec![Expr::Var("x".into())]);
                                    if !row.hidden && !req.scientific && !row.auxiliary && v != "" {
                                        let (g, p) = plot::explicit(
                                            &env,
                                            &call,
                                            req.viewport,
                                            false,
                                            &mut self.geometry,
                                        );
                                        result.geometry = g;
                                        result.points = p;
                                        curves.push((rows.len(), call));
                                        result.kind = "function".into();
                                    }
                                }
                            }
                        }
                        _ => (),
                    }
                }
            }
            let vars = value_expr.variables();
            if let Expr::Point(x, y) = value_expr {
                let mut variables = [false, false];
                for (axis, coordinate) in [x, y].iter().enumerate() {
                    let numeric = |e: &Expr| {
                        matches!(e, Expr::Num(_))
                            || matches!(e,Expr::Unary(_,n) if matches!(n.as_ref(),Expr::Num(_)))
                    };
                    if numeric(coordinate) {
                        result.drag[axis] = Some(DragTarget {
                            id: row.id.clone(),
                            coordinate: Some(axis),
                            list_index: None,
                        })
                    } else if let Expr::Var(n) = coordinate.as_ref() {
                        for (index, other) in parsed.iter().enumerate() {
                            if matches!(other,Some(Ok(Expr::Binary(op,lhs,rhs))) if op=="="&&matches!(lhs.as_ref(),Expr::Var(name) if name==n)&&numeric(rhs))
                            {
                                result.drag[axis] = Some(DragTarget {
                                    id: req.expressions[index].id.clone(),
                                    coordinate: None,
                                    list_index: None,
                                });
                                variables[axis] = true;
                                break;
                            }
                        }
                    }
                }
                result.default_drag_mode = match variables {
                    [true, true] => "xy",
                    [true, false] => "x",
                    [false, true] => "y",
                    _ => "none",
                }
                .into();
            }
            let polar = matches!(ast,Expr::Binary(op,lhs,rhs) if op=="="&&matches!(lhs.as_ref(),Expr::Var(n) if n=="r")&&rhs.variables().contains("theta"));
            let parametric = vars.contains("t")
                && (matches!(ast, Expr::Point(..))
                    || matches!(
                        env.eval(ast, &HashMap::from([("t".into(), Value::Scalar(0.41))])),
                        Ok(Value::Point(..))
                    ));
            let mut domain_bounds = (0., 1.);
            if polar || parametric {
                let mut max = 1.;
                if polar {
                    let Expr::Binary(_, _, radius) = ast else {
                        unreachable!()
                    };
                    let unit = if env.degrees {
                        180.
                    } else {
                        std::f64::consts::PI
                    };
                    max = 12. * unit;
                    for k in 1..=12 {
                        let period = k as f64 * unit;
                        let sign = if k % 2 == 0 { 1. } else { -1. };
                        let periodic = [0.13, 0.51, 1.07, 1.73, 2.31].iter().all(|t| {
                            let value = |angle: f64| {
                                env.eval(
                                    radius,
                                    &HashMap::from([("theta".into(), Value::Scalar(angle))]),
                                )
                                .and_then(|v| v.scalar())
                                .unwrap_or(f64::NAN)
                            };
                            let a = value(t * unit);
                            let b = value(t * unit + period);
                            (a - sign * b).abs() <= 1e-8 * (1. + a.abs() + b.abs())
                        });
                        if periodic {
                            max = period;
                            break;
                        }
                    }
                }
                let default_max = if polar && !env.degrees {
                    let k = (max / std::f64::consts::PI).round() as u32;
                    format!("{}\\pi", if k == 1 { "".into() } else { k.to_string() })
                } else {
                    eval::number(max)
                };
                let min_latex = row.domain_min.clone().unwrap_or_else(|| "0".into());
                let max_latex = row.domain_max.clone().unwrap_or(default_max);
                let bounds = parser::parse(&min_latex)
                    .and_then(|e| env.eval(&e, &empty)?.scalar())
                    .and_then(|min| {
                        parser::parse(&max_latex)
                            .and_then(|e| env.eval(&e, &empty)?.scalar())
                            .map(|max| (min, max))
                    });
                match bounds {
                    Ok((min, max)) if min.is_finite() && max.is_finite() && min < max => {
                        domain_bounds = (min, max)
                    }
                    _ => {
                        result.error =
                            Some("The domain minimum must be less than the maximum.".into())
                    }
                }
                result.domain = Some(Domain {
                    variable: if polar { "theta".into() } else { "t".into() },
                    min: min_latex,
                    max: max_latex,
                });
            }
            if !req.scientific {
                let probe = HashMap::from([
                    ("x".into(), Value::Scalar(0.37)),
                    ("y".into(), Value::Scalar(0.53)),
                    ("t".into(), Value::Scalar(0.41)),
                    ("theta".into(), Value::Scalar(0.79)),
                    ("r".into(), Value::Scalar(1.)),
                ]);
                if let Err(e) = env.eval(value_expr, &probe) {
                    if e.contains("function")
                        || e.contains("argument")
                        || e.contains("takes")
                        || e.contains("same length")
                    {
                        result.error = Some(e);
                    }
                }
            }
            let bound_params: Vec<String> = if let Expr::Binary(op, lhs, _) = ast {
                if op == "=" {
                    if let Expr::Call(_, args) = lhs.as_ref() {
                        args.iter()
                            .filter_map(|p| {
                                if let Expr::Var(n) = p {
                                    Some(n.clone())
                                } else {
                                    None
                                }
                            })
                            .collect()
                    } else {
                        vec![]
                    }
                } else {
                    vec![]
                }
            } else {
                vec![]
            };
            result.missing = vars
                .iter()
                .filter(|n| {
                    !["x", "y"].contains(&n.as_str())
                        && !(parametric && n.as_str() == "t")
                        && !(polar && ["r", "theta"].contains(&n.as_str()))
                        && !(req.complex && n.as_str() == "i")
                        && !bound_params.contains(n)
                        && !env.definitions.contains_key(*n)
                        && !env.values.contains_key(*n)
                })
                .cloned()
                .collect();
            if result.error.is_some() {
            } else if !result.missing.is_empty() {
                result.kind = "missing".into();
            } else if req.scientific
                || is_definition
                || (!vars.contains("x") && !vars.contains("y") && !parametric && !polar)
            {
                match env.eval(value_expr, &empty) {
                    Ok(v) => {
                        if result.kind == "empty" {
                            result.kind = if matches!(v, Value::Point(..) | Value::Complex(_)) {
                                "point"
                            } else if matches!(v, Value::List(_)) {
                                "list"
                            } else {
                                "value"
                            }
                            .into();
                        }
                        result.value = v.scalar().ok().filter(|x| x.is_finite());
                        result.display = Some(v.display());
                        if result.slider.is_some() {
                            let value = result.value.unwrap_or(0.);
                            let evaluate =
                                |latex: &Option<String>,
                                 fallback: Option<f64>|
                                 -> Result<Option<f64>, String> {
                                    if let Some(s) = latex.as_ref().filter(|s| !s.trim().is_empty())
                                    {
                                        let n = env.eval(&parser::parse(s)?, &empty)?.scalar()?;
                                        if !n.is_finite() {
                                            return Err("Slider limits must be finite.".into());
                                        }
                                        Ok(Some(n))
                                    } else {
                                        Ok(fallback)
                                    }
                                };
                            let mut bounds = SliderBounds {
                                min: value.min(-10.),
                                max: value.max(10.),
                                step: None,
                                error: None,
                            };
                            let configured = (|| -> Result<(), String> {
                                bounds.min = evaluate(&row.slider_min_latex, row.slider_min)?
                                    .unwrap_or(bounds.min);
                                bounds.max = evaluate(&row.slider_max_latex, row.slider_max)?
                                    .unwrap_or(bounds.max);
                                bounds.step = evaluate(&row.slider_step_latex, row.slider_step)?;
                                if bounds.min >= bounds.max {
                                    return Err("The minimum must be less than the maximum.".into());
                                }
                                if bounds.step.is_some_and(|s| s <= 0.) {
                                    return Err("The step must be positive.".into());
                                }
                                Ok(())
                            })();
                            bounds.error = configured.err();
                            result.slider_bounds = Some(bounds);
                        }
                        if let Value::List(values) = &v {
                            if let Expr::List(points) = value_expr {
                                for (i, (point, value)) in points.iter().zip(values).enumerate() {
                                    if !matches!(value,Value::Point(x,y) if x.is_finite() && y.is_finite())
                                    {
                                        continue;
                                    }
                                    let mut targets = [None, None];
                                    if let Expr::Point(x, y) = point {
                                        for (axis, c) in [x, y].iter().enumerate() {
                                            if matches!(c.as_ref(), Expr::Num(_))
                                                || matches!(c.as_ref(),Expr::Unary(_,n) if matches!(n.as_ref(),Expr::Num(_)))
                                            {
                                                targets[axis] = Some(DragTarget {
                                                    id: row.id.clone(),
                                                    coordinate: Some(axis),
                                                    list_index: Some(i),
                                                });
                                            }
                                        }
                                    }
                                    result.point_drag.push(targets);
                                }
                            }
                            result.list_length = Some(values.len());
                            result.list_values = Some(
                                values
                                    .iter()
                                    .take(if row.auxiliary { 2000 } else { 10000 })
                                    .map(|v| v.display())
                                    .collect(),
                            );
                            fn literal(e: &Expr) -> bool {
                                match e {
                                    Expr::Num(_) => true,
                                    Expr::Unary(_, n) => literal(n),
                                    Expr::Point(x, y) => literal(x) && literal(y),
                                    Expr::List(xs) => xs.iter().all(literal),
                                    _ => false,
                                }
                            }
                            result.list_literal = literal(value_expr)
                                && values.iter().all(|v| matches!(v, Value::Scalar(_)));
                        }
                        let literal_number = |e: &Expr| {
                            matches!(e, Expr::Num(_))
                                || matches!(e,Expr::Unary(_,v) if matches!(v.as_ref(),Expr::Num(_)))
                        };
                        if !req.scientific
                            && (literal_number(ast)
                                || matches!(ast,Expr::Point(x,y) if literal_number(x)&&literal_number(y)))
                        {
                            result.display = None;
                        }
                        if let Value::Tone(f, g) = &v {
                            result.tones.push([*f, *g]);
                        }
                        if let Value::List(values) = &v {
                            result.tones = values
                                .iter()
                                .filter_map(|v| {
                                    if let Value::Tone(f, g) = v {
                                        Some([*f, *g])
                                    } else {
                                        None
                                    }
                                })
                                .collect();
                        }
                        if !result.tones.is_empty() {
                            result.kind = "tone".into();
                            result.display = None;
                        }
                        if let Value::Color(color) = &v {
                            result.colors.push(color.clone());
                        }
                        if let Value::List(values) = &v {
                            result.colors = values
                                .iter()
                                .filter_map(|v| {
                                    if let Value::Color(c) = v {
                                        Some(c.clone())
                                    } else {
                                        None
                                    }
                                })
                                .collect();
                        }
                        if !result.colors.is_empty() {
                            result.kind = "color".into();
                            result.display = None;
                            if let Expr::Binary(op, lhs, _) = ast {
                                if op == "=" {
                                    if let Expr::Var(n) = lhs.as_ref() {
                                        result.color_name = Some(n.clone());
                                    }
                                }
                            }
                        }
                        if let Value::Visual(visual) = &v {
                            result.kind = "visualization".into();
                            result.visualization = Some(visual.clone());
                            result.display = None;
                            let evaluate = |s: &Option<String>| -> Result<f64, String> {
                                if let Some(s) = s {
                                    env.eval(&parser::parse(s)?, &empty)?.scalar()
                                } else {
                                    Ok(1.)
                                }
                            };
                            let properties =
                                evaluate(&row.visualization.box_offset).and_then(|offset| {
                                    evaluate(&row.visualization.box_height)
                                        .map(|height| (offset, height))
                                });
                            match properties {
                                Ok((offset, height))
                                    if offset.is_finite() && height.is_finite() && height > 0. =>
                                {
                                    if !row.hidden && !req.scientific {
                                        result.geometry = visualizations::geometry(
                                            visual,
                                            &row.visualization,
                                            req.viewport,
                                            offset,
                                            height,
                                            &mut self.geometry,
                                        );
                                    }
                                }
                                _ => {
                                    result.error =
                                        Some("Use a finite offset and positive box height.".into())
                                }
                            }
                        }
                        if let Value::Statistics(s) = &v {
                            result.kind = "statistics".into();
                            result.statistics = Some(s.clone());
                            result.display = None;
                        }
                        if let Value::Inference(t) = &v {
                            result.kind = "inference".into();
                            let mut displayed = *t.clone();
                            let mut configure = || -> Result<(), String> {
                                if let Some(null) = &row.inference_null {
                                    displayed = displayed.with_null(
                                        env.eval(&parser::parse(null)?, &empty)?.scalar()?,
                                    )?;
                                }
                                if let Some(level) = &row.inference_level {
                                    displayed.level =
                                        env.eval(&parser::parse(level)?, &empty)?.scalar()?;
                                    (displayed.lower, displayed.upper) =
                                        displayed.confidence(displayed.level)?;
                                }
                                Ok(())
                            };
                            if let Err(e) = configure() {
                                result.error = Some(e);
                            }
                            result.inference_chart = displayed.chart();
                            result.inference = Some(displayed);
                            result.display = None;
                        }
                        if req.scientific {
                            env.values.insert("ans".into(), v.clone());
                        }
                        if !row.hidden && !req.scientific && !row.auxiliary {
                            let mut pts = vec![];
                            collect_points(&v, &mut pts);
                            if !pts.is_empty() {
                                result.geometry.push(plot::push(
                                    &mut self.geometry,
                                    &pts,
                                    "points",
                                    false,
                                ));
                            }
                        }
                        if let Value::Distribution(kind, params) = &v {
                            result.display = None;
                            match distribution_view::details(kind, params, &row.distribution, &env)
                            {
                                Ok(view) => {
                                    if !row.hidden && !req.scientific && !row.auxiliary {
                                        result.geometry = distribution_view::geometry(
                                            &view,
                                            &row.distribution,
                                            &env,
                                            value_expr,
                                            req.viewport,
                                            &mut self.geometry,
                                        );
                                    }
                                    result.kind = "distribution".into();
                                    result.distribution = Some(view);
                                }
                                Err(e) => result.error = Some(e),
                            }
                        }
                    }
                    Err(e) => {
                        if result.geometry.is_empty() {
                            result.error = Some(e);
                        }
                    }
                }
            } else if !row.hidden && !row.auxiliary {
                match ast {
                    Expr::Binary(op, a, b)
                        if op == "="
                            && matches!(a.as_ref(),Expr::Var(n) if n=="y")
                            && !b.variables().contains("y") =>
                    {
                        let (g, p) =
                            plot::explicit(&env, b, req.viewport, false, &mut self.geometry);
                        result.geometry = g;
                        result.points = p;
                        curves.push((rows.len(), *b.clone()));
                    }
                    Expr::Binary(op, a, b)
                        if op == "="
                            && matches!(a.as_ref(),Expr::Var(n) if n=="x")
                            && !b.variables().contains("x") =>
                    {
                        let (g, p) =
                            plot::explicit(&env, b, req.viewport, true, &mut self.geometry);
                        result.geometry = g;
                        result.points = p;
                    }
                    Expr::Binary(op, a, b)
                        if op == "=" && matches!(a.as_ref(),Expr::Var(n) if n=="r") =>
                    {
                        result.geometry = plot::parametric(
                            &env,
                            b,
                            &Expr::Num(0.),
                            true,
                            domain_bounds,
                            req.viewport,
                            &mut self.geometry,
                        );
                    }
                    Expr::Binary(op, a, b)
                        if ["=", "<", ">", "<=", ">="].contains(&op.as_str()) =>
                    {
                        result.geometry =
                            plot::implicit(&env, a, b, op, req.viewport, &mut self.geometry);
                    }
                    Expr::Point(a, b) if vars.contains("t") => {
                        result.geometry = plot::parametric(
                            &env,
                            a,
                            b,
                            false,
                            domain_bounds,
                            req.viewport,
                            &mut self.geometry,
                        );
                    }
                    _ if parametric => {
                        let x = Expr::Call("x".into(), vec![ast.clone()]);
                        let y = Expr::Call("y".into(), vec![ast.clone()]);
                        result.geometry = plot::parametric(
                            &env,
                            &x,
                            &y,
                            false,
                            domain_bounds,
                            req.viewport,
                            &mut self.geometry,
                        );
                    }
                    _ => {
                        let (g, p) =
                            plot::explicit(&env, ast, req.viewport, false, &mut self.geometry);
                        result.geometry = g;
                        result.points = p;
                        curves.push((rows.len(), ast.clone()));
                    }
                }
                result.kind = "graph".into();
            } else {
                result.kind = "graph".into();
            }
            if result.error.is_some() {
                result.kind = "error".into();
            }
            rows.push(result);
        }
        // Pairwise intersections of explicit curves, including tangent intersections via extrema.
        for a in 0..curves.len().min(12) {
            for b in a + 1..curves.len().min(12) {
                let (ia, fa) = &curves[a];
                let (ib, fb) = &curves[b];
                let f = |x| plot::scalar(&env, fa, x, 0.) - plot::scalar(&env, fb, x, 0.);
                let span = req.viewport.x_max - req.viewport.x_min;
                let h = span * 1e-6;
                let df = |x| (f(x + h) - f(x - h)) / (2. * h);
                let mut prev = req.viewport.x_min;
                for j in 1..=256 {
                    let next = req.viewport.x_min + span * j as f64 / 256.;
                    let candidates = [
                        plot::root(&f, prev, next),
                        plot::root(&df, prev, next).filter(|x| f(*x).abs() < 1e-8),
                    ];
                    for x in candidates.into_iter().flatten() {
                        let y = plot::scalar(&env, fa, x, 0.);
                        if y >= req.viewport.y_min && y <= req.viewport.y_max {
                            let p = Interest {
                                x,
                                y,
                                kind: "intersection".into(),
                            };
                            rows[*ia].points.push(p.clone());
                            rows[*ib].points.push(p);
                        }
                    }
                    prev = next;
                }
            }
        }
        if !req.scientific {
            let relations: Vec<_> = parsed
                .iter()
                .enumerate()
                .filter_map(|(i, ast)| {
                    if req.expressions[i].hidden
                        || rows[i].error.is_some()
                        || rows[i].geometry.is_empty()
                    {
                        return None;
                    }
                    match ast.as_ref()?.as_ref().ok()? {
                        Expr::Binary(op, a, b)
                            if op == "="
                                && (a.variables().contains("x") || a.variables().contains("y")) =>
                        {
                            Some((i, Expr::Binary("-".into(), a.clone(), b.clone())))
                        }
                        _ => None,
                    }
                })
                .take(12)
                .collect();
            for a in 0..relations.len() {
                for b in a + 1..relations.len() {
                    let (ia, fa) = &relations[a];
                    let (ib, fb) = &relations[b];
                    if curves.iter().any(|(i, _)| i == ia) && curves.iter().any(|(i, _)| i == ib) {
                        continue;
                    }
                    for p in intersections::solve(&env, fa, fb, req.viewport) {
                        rows[*ia].points.push(p.clone());
                        rows[*ib].points.push(p);
                    }
                }
            }
        }
        for row in &mut rows {
            row.points
                .sort_by_key(|p| if p.kind == "intersection" { 0 } else { 1 });
            plot::dedup(
                &mut row.points,
                (req.viewport.x_max - req.viewport.x_min) * 1e-6,
            );
        }
        if env.work.get() > 25_000_000 {
            return Err(
                "This calculation is too complex. Try fewer expressions or a smaller list.".into(),
            );
        }
        Ok(Response {
            rows,
            evaluations: env.work.get(),
            engine: "rust-wasm",
        })
    }
}
fn collect_points(v: &Value, out: &mut Vec<f64>) {
    match v {
        Value::Point(x, y) if x.is_finite() && y.is_finite() => out.extend([x, y]),
        Value::Complex(z) if z.is_finite() => out.extend([z.re, z.im]),
        Value::List(xs) => {
            for x in xs {
                collect_points(x, out);
            }
        }
        _ => (),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn value(s: &str) -> f64 {
        let e = parser::parse(s).unwrap();
        Environment::default()
            .eval(&e, &HashMap::new())
            .unwrap()
            .scalar()
            .unwrap()
    }
    fn scene(expressions: &[&str]) -> serde_json::Value {
        let req = serde_json::json!({"expressions":expressions.iter().enumerate().map(|(i,s)|serde_json::json!({"id":i.to_string(),"latex":s})).collect::<Vec<_>>(),"viewport":{"xMin":-10,"xMax":10,"yMin":-8,"yMax":8,"width":864,"height":700}});
        serde_json::from_str(&CalculatorEngine::new().calculate(&req.to_string())).unwrap()
    }
    #[test]
    fn arithmetic() {
        assert_eq!(value("2+3*4"), 14.);
        assert_eq!(value("-2^2"), -4.);
        assert_eq!(value("2^3^2"), 512.);
        assert_eq!(value(r"\frac{1}{2}+\sqrt{81}"), 9.5);
        assert!((value(r"\sin(\pi/2)") - 1.).abs() < 1e-12);
        assert_eq!(value("5!"), 120.);
        assert_eq!(value("nCr(10,3)"), 120.);
    }
    #[test]
    fn lists_and_piecewise() {
        assert_eq!(value("mean([1,2,3,4])"), 2.5);
        assert_eq!(value("total([1...100])"), 5050.);
        assert_eq!(value("{1<2:7,9}"), 7.);
        assert!(value("sqrt(-1)").is_nan());
        assert!(value("1/0").is_nan());
    }
    #[test]
    fn calculus() {
        assert!((value("integral(x^2,x,0,3)") - 9.).abs() < 1e-9);
        assert!((value("derivative(x^3,x,2)") - 12.).abs() < 1e-8);
        assert_eq!(value("sum(n^2,n,1,3)"), 14.);
    }
    #[test]
    fn dependencies_and_errors() {
        let d = scene(&["b=a+1", "a=3", "b^2", "c=d", "d=c"]);
        assert_eq!(d["rows"][2]["value"].as_f64(), Some(16.));
        assert!(d["rows"][3]["error"].as_str().unwrap().contains("Circular"));
    }
    #[test]
    fn regression() {
        let d = scene(&["x_1=[1,2,3,4]", "y_1=[3,5,7,9]", "y_1~m x_1+b", "y=m x+b"]);
        let p = &d["rows"][2]["fit"]["parameters"];
        assert!((p["m"].as_f64().unwrap() - 2.).abs() < 1e-8, "{d}");
        assert!((p["b"].as_f64().unwrap() - 1.).abs() < 1e-8);
    }
    #[test]
    fn tangent_intersection() {
        let d = scene(&["y=(x-0.123)^2", "y=0"]);
        assert!(
            d["rows"][0]["points"]
                .as_array()
                .unwrap()
                .iter()
                .any(|p| p["kind"] == "intersection"
                    && (p["x"].as_f64().unwrap() - 0.123).abs() < 1e-6),
            "{d}"
        );
    }
    #[test]
    fn rejects_resource_exhaustion() {
        assert!(parser::parse(&"(".repeat(10000)).is_err());
        assert!(
            Environment::default()
                .eval(&parser::parse("[1...100000000]").unwrap(), &HashMap::new())
                .is_err()
        );
    }
    #[test]
    fn latex_calculus_and_inverse_trig() {
        assert!((value(r"\sin^{-1}(1)") - std::f64::consts::FRAC_PI_2).abs() < 1e-12);
        assert_eq!(value(r"\sum_{n=1}^{10}n"), 55.);
        assert!((value(r"\int_{0}^{3}x^2dx") - 9.).abs() < 1e-9);
        assert!((value("normaldist(0,1).cdf(0)") - 0.5).abs() < 1e-12);
    }
    #[test]
    fn empty_point_lists_and_invalid_indices_are_safe() {
        let env = Environment::default();
        let value = env
            .eval(&parser::parse("([],1)").unwrap(), &HashMap::new())
            .unwrap();
        assert!(matches!(value,Value::List(xs) if xs.is_empty()));
        assert!(super::tests::value("[1,2][-1E300]").is_nan());
    }
    #[test]
    fn tiny_implicit_circle_is_not_lost() {
        let d = scene(&["(x-0.123)^2+(y+0.217)^2=0.0016"]);
        assert!(
            d["rows"][0]["geometry"][0]["count"].as_u64().unwrap() > 0,
            "{d}"
        );
    }
    #[test]
    fn polar_and_distribution_have_geometry() {
        for s in ["r=sin(theta)", "normaldist(0,1)"] {
            let d = scene(&[s]);
            assert!(
                d["rows"][0]["geometry"][0]["count"].as_u64().unwrap() > 100,
                "{d}"
            );
        }
    }
    #[test]
    fn radius_variables_and_curve_domains() {
        let d = scene(&["r=2", "x^2+y^2=r^2", "r", "t=3", "t+2"]);
        assert_eq!(d["rows"][0]["value"], 2.);
        assert_eq!(d["rows"][0]["slider"], "r");
        assert!(d["rows"][0]["geometry"].as_array().unwrap().is_empty());
        assert!(d["rows"][1]["geometry"][0]["count"].as_u64().unwrap() > 0);
        assert_eq!(d["rows"][2]["value"], 2.);
        assert_eq!(d["rows"][4]["value"], 5.);
        for (s, max) in [
            ("r=sin(theta)", "\\pi"),
            ("r=sin(2theta)", "2\\pi"),
            ("r=theta", "12\\pi"),
            ("(cos(t),sin(t))", "1"),
        ] {
            let d = scene(&[s]);
            assert!(d["rows"][0]["error"].is_null(), "{d}");
            assert_eq!(d["rows"][0]["domain"]["max"], max, "{s}");
        }
        let mut engine = CalculatorEngine::new();
        let d: serde_json::Value = serde_json::from_str(&engine.calculate(&serde_json::json!({
            "expressions":[{"id":"circle","latex":"(cos(t),sin(t))","domainMin":"0","domainMax":"2pi"}],
            "viewport":{"xMin":-10.,"xMax":10.,"yMin":-10.,"yMax":10.,"width":800.,"height":800.}
        }).to_string())).unwrap();
        assert!(d["rows"][0]["error"].is_null(), "{d}");
        let points = engine.take_geometry();
        assert!(points.chunks_exact(2).any(|p| p[0] < -0.999));
        assert!(points.chunks_exact(2).any(|p| p[1] < -0.999));
    }
    #[test]
    fn user_function_derivative_marks() {
        let d = scene(&["f(x)=x^3", "f'(2)", "f''(2)"]);
        for i in [1, 2] {
            assert!(d["rows"][i]["error"].is_null(), "{d}");
            assert!(
                (d["rows"][i]["value"].as_f64().unwrap() - 12.).abs() < 1e-4,
                "{d}"
            );
        }
    }
    #[test]
    fn list_graphs_and_drag_targets() {
        let d = scene(&[
            "y=x+[1,2,3]",
            "(cos(t)*[1,2],sin(t)*[1,2])",
            "a=2",
            "b=3",
            "(a,b)",
            "(1,2)",
        ]);
        assert_eq!(d["rows"][0]["geometry"].as_array().unwrap().len(), 3);
        assert_eq!(d["rows"][1]["geometry"].as_array().unwrap().len(), 2);
        assert_eq!(d["rows"][4]["defaultDragMode"], "xy");
        assert_eq!(
            d["rows"][4]["drag"][0]["coordinate"],
            serde_json::Value::Null
        );
        assert_eq!(d["rows"][5]["drag"][1]["coordinate"], 1);
        assert_eq!(d["rows"][5]["defaultDragMode"], "none");
    }
    #[test]
    fn numeric_display_and_discrete_inclusive_probability() {
        for (n, s) in [
            (1. / 3., "0.333333333333"),
            (123456.123456789, "123456.123457"),
            (1e-7, "1e-7"),
            (1234567890123., "1.2345678901e12"),
        ] {
            assert_eq!(eval::number(n), s);
        }
        assert_eq!(value("discretedist([1,2,3],[1,2,1]).cdf(2,2)"), 0.5);
        assert_eq!(value("geodist(0.5).pdf(1)"), 0.5);
        assert_eq!(value("geodist(0.5).cdf(1,2)"), 0.75);
    }
    #[test]
    fn invalid_graph_function_is_explained() {
        let d = scene(&["y=sin(x,2)"]);
        assert!(
            d["rows"][0]["error"]
                .as_str()
                .unwrap()
                .contains("one argument")
        );
    }
    #[test]
    fn bound_calculus_variables_are_not_sliders() {
        let d = scene(&[r"\sum_{n=1}^{10}n", r"\int_0^3 x^2dx", "f(a)=a^2", "f(3)"]);
        assert_eq!(d["rows"][0]["value"], 55.);
        assert_eq!(d["rows"][1]["value"], 9.);
        assert_eq!(d["rows"][2]["missing"], serde_json::json!([]));
        assert_eq!(d["rows"][3]["value"], 9.);
    }
    #[test]
    fn implicit_and_vertical_intersections() {
        let d = scene(&["x^2+y^2=25", "y=4", "x=3"]);
        let points = d["rows"][0]["points"].as_array().unwrap();
        for (x, y) in [(3., 4.), (-3., 4.), (3., -4.)] {
            assert!(
                points.iter().any(|p| p["kind"] == "intersection"
                    && (p["x"].as_f64().unwrap() - x).abs() < 1e-7
                    && (p["y"].as_f64().unwrap() - y).abs() < 1e-7),
                "{d}"
            );
        }
    }
}
