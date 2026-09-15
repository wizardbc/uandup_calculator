mod compiled;
mod distributions;
mod eval;
mod intersections;
mod interval;
mod parser;
mod plot;
mod regression;

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
}
#[derive(Deserialize)]
struct Request {
    expressions: Vec<InputRow>,
    viewport: Viewport,
    #[serde(default)]
    degrees: bool,
    #[serde(default)]
    scientific: bool,
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
    geometry: Vec<Geometry>,
    points: Vec<Interest>,
    fit: Option<regression::Fit>,
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
            geometry: vec![],
            points: vec![],
            fit: None,
        }
    }
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
        let parsed: Vec<_> = req
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
        let mut env = Environment {
            degrees: req.degrees,
            ..Default::default()
        };
        let empty = HashMap::new();
        let mut duplicate = BTreeSet::new();
        for ast in parsed.iter().flatten().flatten() {
            if let Expr::Binary(op, lhs, rhs) = ast {
                if op == "=" {
                    match lhs.as_ref() {
                        Expr::Var(n) if !["x", "y", "r"].contains(&n.as_str()) => {
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
        for (i, ast) in parsed.iter().enumerate() {
            if let Some(Ok(Expr::Binary(op, a, b))) = ast {
                if op == "~" {
                    let result = regression::fit(&env, a, b, req.expressions[i].log_mode);
                    if let Ok(f) = &result {
                        for (k, v) in &f.parameters {
                            env.values.insert(k.clone(), Value::Scalar(*v));
                        }
                    }
                    fits.insert(i, result);
                }
            }
        }
        let mut rows = vec![];
        let mut curves: Vec<(usize, Expr)> = vec![];
        for (i, row) in req.expressions.iter().enumerate() {
            let mut result = RowResult::new(row.id.clone());
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
                        result.fit = Some(f);
                        if !row.hidden {
                            if let Expr::Binary(_, _, rhs) = ast {
                                let lists: Vec<_> = rhs
                                    .variables()
                                    .into_iter()
                                    .filter(|n| matches!(env.values.get(n), Some(Value::List(_))))
                                    .collect();
                                if lists.len() == 1 {
                                    let curve = rhs.substitute(&lists[0], &Expr::Var("x".into()));
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
                        Expr::Var(n) if !["x", "y", "r"].contains(&n.as_str()) => {
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
                    !["x", "y", "t", "theta", "r"].contains(&n.as_str())
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
                || (!vars.contains("x")
                    && !vars.contains("y")
                    && !vars.contains("t")
                    && !vars.contains("theta")
                    && !vars.contains("r"))
            {
                match env.eval(value_expr, &empty) {
                    Ok(v) => {
                        if result.kind == "empty" {
                            result.kind = if matches!(v, Value::Point(..)) {
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
                            if let Value::Distribution(_, _) = v {
                                let pdf = Expr::Call(
                                    "pdf".into(),
                                    vec![value_expr.clone(), Expr::Var("x".into())],
                                );
                                let (g, p) = plot::explicit(
                                    &env,
                                    &pdf,
                                    req.viewport,
                                    false,
                                    &mut self.geometry,
                                );
                                result.geometry = g;
                                result.points = p;
                                result.kind = "graph".into();
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
                        result.geometry =
                            plot::parametric(&env, a, b, false, req.viewport, &mut self.geometry);
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
        for s in ["r=2", "normaldist(0,1)"] {
            let d = scene(&[s]);
            assert!(
                d["rows"][0]["geometry"][0]["count"].as_u64().unwrap() > 100,
                "{d}"
            );
        }
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
