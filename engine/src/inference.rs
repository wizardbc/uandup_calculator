use crate::eval::Value;
use serde::Serialize;
use statrs::distribution::{ChiSquared, Continuous, ContinuousCDF, Normal, StudentsT};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub count: f64,
    pub mean: f64,
    pub stdev: f64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Test {
    pub kind: String,
    pub estimate: f64,
    pub stderr: f64,
    pub dof: Option<f64>,
    pub null: f64,
    pub score: f64,
    pub p: f64,
    pub pleft: f64,
    pub pright: f64,
    pub level: f64,
    pub lower: f64,
    pub upper: f64,
    pub observed: Vec<Vec<f64>>,
    pub expected: Vec<Vec<f64>>,
    #[serde(skip)]
    pub proportions: Vec<(f64, f64)>,
}
impl Test {
    pub fn chart(&self) -> Vec<[f64; 2]> {
        let chi = self.kind.starts_with("chisq");
        let width = if chi {
            (self.dof.unwrap_or(1.) + 6. * (2. * self.dof.unwrap_or(1.)).sqrt())
                .max(self.score * 1.3)
        } else {
            4f64.max(self.score.abs() * 1.7).min(40.)
        };
        let lo = if chi { 0. } else { -width };
        let hi = width;
        (0..=180)
            .map(|i| {
                let x = lo + (hi - lo) * i as f64 / 180.;
                let y = if chi {
                    ChiSquared::new(self.dof.unwrap())
                        .unwrap()
                        .pdf(x.max(0.00001))
                } else if self.kind == "ttest" {
                    StudentsT::new(0., 1., self.dof.unwrap()).unwrap().pdf(x)
                } else {
                    Normal::new(0., 1.).unwrap().pdf(x)
                };
                [x, if y.is_finite() { y } else { 0. }]
            })
            .collect()
    }
    pub fn normal(
        kind: &str,
        estimate: f64,
        stderr: f64,
        dof: Option<f64>,
    ) -> Result<Self, String> {
        if !estimate.is_finite() || !(stderr > 0.) || !stderr.is_finite() {
            return Err("The standard error must be positive. Check the sample sizes and standard deviations.".into());
        }
        let mut t = Self {
            kind: kind.into(),
            estimate,
            stderr,
            dof,
            null: 0.,
            score: 0.,
            p: 0.,
            pleft: 0.,
            pright: 0.,
            level: 0.95,
            lower: 0.,
            upper: 0.,
            observed: vec![],
            expected: vec![],
            proportions: vec![],
        };
        t.update()?;
        Ok(t)
    }
    fn distribution_cdf(&self, x: f64) -> Result<f64, String> {
        if self.kind == "ttest" {
            Ok(StudentsT::new(0., 1., self.dof.unwrap())
                .map_err(|_| "Invalid degrees of freedom.")?
                .cdf(x))
        } else {
            Ok(Normal::new(0., 1.).unwrap().cdf(x))
        }
    }
    pub fn confidence(&self, level: f64) -> Result<(f64, f64), String> {
        if !(level > 0. && level < 1.) {
            return Err("The confidence level must be between 0 and 1.".into());
        }
        let q = if self.kind == "ttest" {
            StudentsT::new(0., 1., self.dof.unwrap())
                .map_err(|_| "Invalid degrees of freedom.")?
                .inverse_cdf((1. + level) / 2.)
        } else {
            Normal::new(0., 1.).unwrap().inverse_cdf((1. + level) / 2.)
        };
        Ok((
            self.estimate - q * self.stderr,
            self.estimate + q * self.stderr,
        ))
    }
    pub fn with_null(&self, null: f64) -> Result<Self, String> {
        if self.kind.starts_with("chisq") {
            return Err("Chi-square tests do not accept a null parameter.".into());
        }
        let mut next = self.clone();
        next.null = null;
        next.update()?;
        Ok(next)
    }
    fn update(&mut self) -> Result<(), String> {
        let mut se = self.stderr;
        if self.kind == "zproptest" {
            if self.proportions.len() == 1 {
                if !(self.null > 0. && self.null < 1.) {
                    return Err("The null proportion must be between 0 and 1.".into());
                }
                se = (self.null * (1. - self.null) / self.proportions[0].1).sqrt();
            } else if self.proportions.len() == 2 && self.null == 0. {
                let [(a, n), (b, m)] = self.proportions[..] else {
                    unreachable!()
                };
                let pooled = (a + b) / (n + m);
                se = (pooled * (1. - pooled) * (1. / n + 1. / m)).sqrt();
            }
        }
        self.score = (self.estimate - self.null) / se;
        self.pleft = self.distribution_cdf(self.score)?;
        // Evaluate the opposite tail directly so extreme tails are not lost to subtraction.
        self.pright = self.distribution_cdf(-self.score)?;
        self.p = (2. * self.pleft.min(self.pright)).min(1.);
        (self.lower, self.upper) = self.confidence(self.level)?;
        Ok(())
    }
}
fn summary(v: &Value) -> Result<Summary, String> {
    if let Value::Summary(s) = v {
        return Ok(s.clone());
    }
    if let Value::Statistics(s) = v {
        return Ok(Summary {
            count: s.count as f64,
            mean: s.mean,
            stdev: s.stdev,
        });
    }
    let xs = v.numbers()?;
    if xs.len() < 2 || xs.iter().any(|x| !x.is_finite()) {
        return Err("Use at least two finite data values.".into());
    }
    let n = xs.len() as f64;
    let mean = xs.iter().sum::<f64>() / n;
    Ok(Summary {
        count: n,
        mean,
        stdev: (xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.)).sqrt(),
    })
}
fn samples(name: &str, args: &[Value]) -> Result<Test, String> {
    let z = name == "ztest";
    let mut sets = vec![];
    let mut i = 0;
    while i < args.len() {
        if matches!(args[i], Value::Scalar(_)) {
            if i + 3 > args.len() {
                return Err("Enter sample size, mean, and standard deviation.".into());
            }
            let s = Summary {
                count: args[i].scalar()?,
                mean: args[i + 1].scalar()?,
                stdev: args[i + 2].scalar()?,
            };
            if s.count <= 1.
                || s.count.fract() != 0.
                || !s.count.is_finite()
                || !s.mean.is_finite()
                || s.stdev <= 0.
                || !s.stdev.is_finite()
            {
                return Err("Check the sample size and standard deviation.".into());
            }
            sets.push(s);
            i += 3;
            continue;
        }
        let mut s = summary(&args[i])?;
        i += 1;
        if z && !matches!(&args[i - 1], Value::Summary(_)) {
            s.stdev = args
                .get(i)
                .ok_or("Enter the population standard deviation.")?
                .scalar()?;
            i += 1;
        }
        if s.count <= 1.
            || s.count.fract() != 0.
            || !s.count.is_finite()
            || s.stdev <= 0.
            || !s.stdev.is_finite()
        {
            return Err("Check the sample size and standard deviation.".into());
        }
        sets.push(s);
    }
    if sets.is_empty() || sets.len() > 2 {
        return Err("Use one or two samples.".into());
    }
    let a = &sets[0];
    let va = a.stdev.powi(2) / a.count;
    let (estimate, variance, dof) = if let Some(b) = sets.get(1) {
        let vb = b.stdev.powi(2) / b.count;
        (
            a.mean - b.mean,
            va + vb,
            (va + vb).powi(2) / (va * va / (a.count - 1.) + vb * vb / (b.count - 1.)),
        )
    } else {
        (a.mean, va, a.count - 1.)
    };
    Test::normal(
        name,
        estimate,
        variance.sqrt(),
        if z { None } else { Some(dof) },
    )
}
fn proportion(args: &[Value]) -> Result<Test, String> {
    if args.len() != 2 && args.len() != 4 {
        return Err("Use successes and sample size for one or two samples.".into());
    }
    let mut sets = vec![];
    for pair in args.chunks_exact(2) {
        let x = pair[0].scalar()?;
        let n = pair[1].scalar()?;
        if !x.is_finite()
            || !n.is_finite()
            || n <= 0.
            || n.fract() != 0.
            || x < 0.
            || x > n
            || x.fract() != 0.
        {
            return Err("Successes must be an integer from 0 to the sample size.".into());
        }
        sets.push((x, n));
    }
    let mut estimate = sets[0].0 / sets[0].1;
    let mut variance = estimate * (1. - estimate) / sets[0].1;
    if sets.len() == 2 {
        let p = sets[1].0 / sets[1].1;
        estimate -= p;
        variance += p * (1. - p) / sets[1].1;
    }
    // Zero estimated variance is allowed at the boundary of a proportion interval.
    let mut t = Test {
        kind: "zproptest".into(),
        estimate,
        stderr: variance.sqrt(),
        dof: None,
        null: if sets.len() == 1 { 0.5 } else { 0. },
        score: 0.,
        p: 0.,
        pleft: 0.,
        pright: 0.,
        level: 0.95,
        lower: 0.,
        upper: 0.,
        observed: vec![],
        expected: vec![],
        proportions: sets,
    };
    t.update()?;
    Ok(t)
}
fn chi_square(name: &str, args: &[Value]) -> Result<Test, String> {
    let mut observed = vec![];
    let expected;
    let dof;
    if name == "chisqgof" {
        if args.is_empty() || args.len() > 2 {
            return Err("Use observed counts and optional expected counts.".into());
        }
        let o = args[0].numbers()?;
        if o.len() < 2 {
            return Err("Use at least two categories.".into());
        }
        let total = o.iter().sum::<f64>();
        let e = if args.len() == 2 {
            args[1].numbers()?
        } else {
            vec![total / o.len() as f64; o.len()]
        };
        if e.len() != o.len() {
            return Err("Observed and expected lists must have the same length.".into());
        }
        let et = e.iter().sum::<f64>();
        if (et - total).abs() > 1e-8 * total.abs().max(1.) {
            return Err("Observed and expected counts must have equal totals.".into());
        }
        dof = (o.len() - 1) as f64;
        observed.push(o);
        expected = vec![e];
    } else {
        if args.len() < 2 {
            return Err("Use at least two columns of observed counts.".into());
        }
        for a in args {
            observed.push(a.numbers()?);
        }
        let height = observed[0].len();
        if height < 2 || observed.iter().any(|c| c.len() != height) {
            return Err("Use columns of equal length with at least two rows.".into());
        }
        let cols: Vec<_> = observed.iter().map(|c| c.iter().sum::<f64>()).collect();
        let rows: Vec<_> = (0..height)
            .map(|r| observed.iter().map(|c| c[r]).sum::<f64>())
            .collect();
        let total = cols.iter().sum::<f64>();
        expected = cols
            .iter()
            .map(|c| rows.iter().map(|r| c * r / total).collect())
            .collect::<Vec<Vec<_>>>();
        dof = ((observed.len() - 1) * (height - 1)) as f64;
    }
    if observed.iter().flatten().any(|x| !x.is_finite() || *x < 0.)
        || expected
            .iter()
            .flatten()
            .any(|x| !x.is_finite() || *x <= 0.)
    {
        return Err("Observed counts must be nonnegative and expected counts positive.".into());
    }
    let score = observed
        .iter()
        .flatten()
        .zip(expected.iter().flatten())
        .map(|(o, e)| (o - e).powi(2) / e)
        .sum::<f64>();
    let dist = ChiSquared::new(dof).map_err(|_| "Invalid degrees of freedom.")?;
    let p = dist.sf(score);
    Ok(Test {
        kind: name.into(),
        estimate: score,
        stderr: 0.,
        dof: Some(dof),
        null: 0.,
        score,
        p,
        pleft: dist.cdf(score),
        pright: p,
        level: 0.95,
        lower: 0.,
        upper: 0.,
        observed,
        expected,
        proportions: vec![],
    })
}

pub fn function(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    if ![
        "ztest",
        "ttest",
        "zproptest",
        "chisqtest",
        "chisqgof",
        "null",
        "conf",
        "estimate",
        "stderr",
        "dof",
        "score",
        "p",
        "pleft",
        "pright",
        "lower",
        "upper",
    ]
    .contains(&name)
    {
        return None;
    }
    Some((|| {
        if name == "stats" {
            let s = if args.len() == 1 {
                summary(&args[0])?
            } else if args.len() == 3 {
                Summary {
                    count: args[0].scalar()?,
                    mean: args[1].scalar()?,
                    stdev: args[2].scalar()?,
                }
            } else {
                return Err(
                    "Use stats(data) or stats(sample size, mean, standard deviation).".into(),
                );
            };
            if !s.count.is_finite()
                || s.count < 2.
                || s.count.fract() != 0.
                || !s.mean.is_finite()
                || !s.stdev.is_finite()
                || s.stdev < 0.
            {
                return Err("Check the sample statistics.".into());
            }
            return Ok(Value::Summary(s));
        }
        if name == "ztest" || name == "ttest" {
            return Ok(Value::Inference(Box::new(samples(name, args)?)));
        }
        if name == "zproptest" {
            return Ok(Value::Inference(Box::new(proportion(args)?)));
        }
        if name == "chisqtest" || name == "chisqgof" {
            return Ok(Value::Inference(Box::new(chi_square(name, args)?)));
        }
        if let Some(Value::Interval(lo, hi)) = args.first() {
            return match name {
                "lower" => Ok(Value::Scalar(*lo)),
                "upper" => Ok(Value::Scalar(*hi)),
                _ => Err("Choose the lower or upper interval bound.".into()),
            };
        }
        let Some(Value::Inference(t)) = args.first() else {
            return Err("Use this property on an inference test.".into());
        };
        if name == "null" {
            if args.len() != 2 {
                return Err("Enter a null hypothesis value.".into());
            }
            return Ok(Value::Inference(Box::new(t.with_null(args[1].scalar()?)?)));
        }
        if name == "conf" {
            if args.len() != 2 || t.kind.starts_with("chisq") {
                return Err("Use conf(level) with a z- or t-test.".into());
            }
            let (lo, hi) = t.confidence(args[1].scalar()?)?;
            return Ok(Value::Interval(lo, hi));
        }
        if args.len() != 1 {
            return Err("This property does not take arguments.".into());
        }
        Ok(Value::Scalar(match name {
            "estimate" => t.estimate,
            "stderr" => t.stderr,
            "dof" => t.dof.ok_or("A z-test does not have degrees of freedom.")?,
            "score" => t.score,
            "p" => t.p,
            "pleft" => t.pleft,
            "pright" => t.pright,
            _ => return Err("This property is not available on a test.".into()),
        }))
    })())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn list(xs: &[f64]) -> Value {
        Value::List(xs.iter().map(|x| Value::Scalar(*x)).collect())
    }
    #[test]
    fn quantitative_tests() {
        let t = samples("ztest", &[list(&[1., 2., 3.]), Value::Scalar(0.5)]).unwrap();
        assert!((t.estimate - 2.).abs() < 1e-12);
        assert!((t.stderr - 0.5 / 3f64.sqrt()).abs() < 1e-12);
        let t = t.with_null(2.).unwrap();
        assert!((t.p - 1.).abs() < 1e-12);
        let t = samples("ttest", &[list(&[1., 2., 3.])])
            .unwrap()
            .with_null(1.)
            .unwrap();
        assert_eq!(t.dof, Some(2.));
        assert!((t.p - 0.2254033307585166).abs() < 1e-12);
        let t = samples("ttest", &[list(&[1., 2., 3.]), list(&[3., 4., 5.])]).unwrap();
        assert_eq!(t.dof, Some(4.));
        assert!((t.score + 6f64.sqrt()).abs() < 1e-12);
    }
    #[test]
    fn categorical_tests() {
        let t = proportion(&[Value::Scalar(45.), Value::Scalar(80.)]).unwrap();
        assert_eq!(t.estimate, 0.5625);
        assert!((t.score - 1.118033988749895).abs() < 1e-12);
        let t = chi_square("chisqgof", &[list(&[30., 20., 25., 25.])]).unwrap();
        assert_eq!(t.score, 2.);
        assert_eq!(t.dof, Some(3.));
        assert!((t.p - 0.5724067044708798).abs() < 1e-12);
        let t = chi_square(
            "chisqtest",
            &[list(&[15., 5., 10., 10.]), list(&[15., 15., 15., 15.])],
        )
        .unwrap();
        assert_eq!(t.dof, Some(3.));
        assert!((t.score - 3.125).abs() < 1e-12);
    }
}
