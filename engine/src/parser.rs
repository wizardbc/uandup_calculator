use std::collections::BTreeSet;

#[derive(Clone, Debug, PartialEq)]
pub enum Expr {
    Num(f64),
    Var(String),
    Unary(char, Box<Expr>),
    Binary(String, Box<Expr>, Box<Expr>),
    Call(String, Vec<Expr>),
    List(Vec<Expr>),
    Point(Box<Expr>, Box<Expr>),
    Piecewise(Vec<(Expr, Expr)>, Option<Box<Expr>>),
    Restrict(Box<Expr>, Box<Expr>),
    Index(Box<Expr>, Box<Expr>),
    Range(Box<Expr>, Box<Expr>, Option<Box<Expr>>),
}

impl Expr {
    pub fn substitute(&self, name: &str, value: &Expr) -> Expr {
        let sub = |x: &Expr| Box::new(x.substitute(name, value));
        match self {
            Self::Var(n) if n == name => value.clone(),
            Self::Unary(op, e) => Self::Unary(*op, sub(e)),
            Self::Binary(op, a, b) => Self::Binary(op.clone(), sub(a), sub(b)),
            Self::Call(n, args) => Self::Call(
                n.clone(),
                args.iter().map(|a| a.substitute(name, value)).collect(),
            ),
            Self::List(xs) => Self::List(xs.iter().map(|a| a.substitute(name, value)).collect()),
            Self::Point(a, b) => Self::Point(sub(a), sub(b)),
            Self::Restrict(a, b) => Self::Restrict(sub(a), sub(b)),
            Self::Index(a, b) => Self::Index(sub(a), sub(b)),
            Self::Range(a, b, c) => Self::Range(sub(a), sub(b), c.as_ref().map(|x| sub(x))),
            Self::Piecewise(cases, otherwise) => Self::Piecewise(
                cases
                    .iter()
                    .map(|(a, b)| (a.substitute(name, value), b.substitute(name, value)))
                    .collect(),
                otherwise.as_ref().map(|x| sub(x)),
            ),
            _ => self.clone(),
        }
    }
    pub fn variables(&self) -> BTreeSet<String> {
        let mut set = BTreeSet::new();
        self.collect(&mut set);
        set
    }
    fn collect(&self, out: &mut BTreeSet<String>) {
        match self {
            Self::Call(name, xs)
                if ["__for", "__with"].contains(&name.as_str()) && !xs.is_empty() =>
            {
                let mut body = xs[0].variables();
                for pair in xs[1..].chunks_exact(2) {
                    if let Self::Var(n) = &pair[0] {
                        body.remove(n);
                    }
                    pair[1].collect(out);
                }
                out.extend(body);
            }
            Self::Var(v) => {
                if !["pi", "e", "infinity"].contains(&v.as_str()) {
                    out.insert(v.clone());
                }
            }
            Self::Unary(_, x) => x.collect(out),
            Self::Binary(_, a, b)
            | Self::Point(a, b)
            | Self::Restrict(a, b)
            | Self::Index(a, b) => {
                a.collect(out);
                b.collect(out);
            }
            Self::Call(name, xs)
                if ["sum", "product", "integral", "derivative"].contains(&name.as_str())
                    && xs.len() >= 3 =>
            {
                let mut body = xs[0].variables();
                if let Self::Var(bound) = &xs[1] {
                    body.remove(bound);
                }
                out.extend(body);
                for x in &xs[2..] {
                    x.collect(out);
                }
            }
            Self::Call(_, xs) | Self::List(xs) => {
                for x in xs {
                    x.collect(out);
                }
            }
            Self::Piecewise(xs, fallback) => {
                for (a, b) in xs {
                    a.collect(out);
                    b.collect(out);
                }
                if let Some(x) = fallback {
                    x.collect(out);
                }
            }
            Self::Range(a, b, c) => {
                a.collect(out);
                b.collect(out);
                if let Some(x) = c {
                    x.collect(out);
                }
            }
            _ => (),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Num(f64),
    Id(String),
    Op(String),
    L(char),
    R(char),
    Comma,
    Colon,
    Dots,
    End,
}

pub fn builtin(s: &str) -> bool {
    [
        "sin",
        "cos",
        "tan",
        "sec",
        "csc",
        "cot",
        "arcsin",
        "arccos",
        "arctan",
        "arcsec",
        "arccsc",
        "arccot",
        "sinh",
        "cosh",
        "tanh",
        "arcsinh",
        "arccosh",
        "arctanh",
        "sqrt",
        "root",
        "abs",
        "ln",
        "log",
        "exp",
        "floor",
        "ceil",
        "round",
        "sign",
        "mod",
        "min",
        "max",
        "mean",
        "median",
        "total",
        "length",
        "count",
        "stdev",
        "stdevp",
        "var",
        "variance",
        "mad",
        "quantile",
        "sort",
        "unique",
        "join",
        "nCr",
        "nPr",
        "gcd",
        "lcm",
        "factorial",
        "normalpdf",
        "normalcdf",
        "inverseNormal",
        "binomialpdf",
        "binomialcdf",
        "poissonpdf",
        "poissoncdf",
        "derivative",
        "integral",
        "sum",
        "product",
        "cov",
        "corr",
        "normaldist",
        "tdist",
        "chisqdist",
        "uniformdist",
        "binomialdist",
        "poissondist",
        "geodist",
        "pdf",
        "cdf",
        "inversecdf",
        "real",
        "imag",
        "conj",
        "arg",
        "csch",
        "sech",
        "coth",
        "stats",
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
        "quartile",
        "covp",
        "spearman",
        "varp",
        "repeat",
        "distance",
        "midpoint",
        "logbase",
        "for",
        "with",
        "shuffle",
        "random",
        "discretedist",
        "histogram",
        "dotplot",
        "boxplot",
        "polygon",
        "rgb",
        "hsv",
        "okhsv",
        "oklab",
        "oklch",
        "tone",
    ]
    .contains(&s)
}

// Converts only presentation syntax. Mathematical precedence is handled by the parser.
pub fn normalize(input: &str) -> Result<String, String> {
    if input.len() > 8192 {
        return Err("This expression is too long.".into());
    }
    let chars: Vec<char> = input.chars().collect();
    fn group(c: &[char], i: &mut usize, depth: usize) -> Result<String, String> {
        if depth > 64 {
            return Err("This expression is nested too deeply.".into());
        }
        while *i < c.len() && c[*i].is_whitespace() {
            *i += 1;
        }
        if c.get(*i) == Some(&'{') {
            *i += 1;
            let start = *i;
            let mut level = 1;
            while *i < c.len() && level > 0 {
                if c[*i] == '{' {
                    level += 1;
                }
                if c[*i] == '}' {
                    level -= 1;
                }
                if level > 0 {
                    *i += 1;
                }
            }
            if level != 0 {
                return Err("Finish the expression.".into());
            }
            let text: String = c[start..*i].iter().collect();
            *i += 1;
            norm(&text.chars().collect::<Vec<_>>(), depth + 1)
        } else if *i < c.len() {
            let s = c[*i].to_string();
            *i += 1;
            Ok(s)
        } else {
            Err("Finish the expression.".into())
        }
    }
    fn norm(c: &[char], depth: usize) -> Result<String, String> {
        let mut out = String::new();
        let mut i = 0;
        while i < c.len() {
            let ch = c[i];
            i += 1;
            if ch == '\\' {
                if i < c.len() && !c[i].is_ascii_alphabetic() {
                    let v = c[i];
                    i += 1;
                    match v {
                        '{' | '}' | '|' | '%' => out.push(v),
                        _ => (),
                    };
                    continue;
                }
                let start = i;
                while i < c.len() && c[i].is_ascii_alphabetic() {
                    i += 1;
                }
                let cmd: String = c[start..i].iter().collect();
                while c.get(i).is_some_and(|v| v.is_whitespace()) {
                    i += 1;
                }
                match cmd.as_str() {
                    "left" | "right" | "quad" | "qquad" | "displaystyle" => (),
                    "frac" | "dfrac" | "tfrac" => {
                        let a = group(c, &mut i, depth)?;
                        let b = group(c, &mut i, depth)?;
                        if a == "d" && b.len() == 2 && b.starts_with('d') {
                            let variable = &b[1..];
                            let body = norm(&c[i..], depth + 1)?;
                            out.push_str(&format!("derivative(({body}),{variable},{variable})"));
                            return Ok(out);
                        }
                        out.push_str(&format!("(({a})/({b}))"));
                    }
                    "sum" | "prod" | "int" => {
                        if c.get(i) != Some(&'_') {
                            return Err("Enter the lower bound.".into());
                        }
                        i += 1;
                        let lower = group(c, &mut i, depth)?;
                        while c.get(i).is_some_and(|v| v.is_whitespace()) {
                            i += 1;
                        }
                        if c.get(i) != Some(&'^') {
                            return Err("Enter the upper bound.".into());
                        }
                        i += 1;
                        let upper = group(c, &mut i, depth)?;
                        let body = norm(&c[i..], depth + 1)?;
                        if cmd == "int" {
                            let body = body.trim();
                            let chars: Vec<_> = body.chars().collect();
                            if chars.len() < 3 || chars[chars.len() - 2] != 'd' {
                                return Err(
                                    "End the integral with a differential, such as dx.".into()
                                );
                            }
                            let variable = chars[chars.len() - 1];
                            let integrand: String = chars[..chars.len() - 2].iter().collect();
                            out.push_str(&format!(
                                "integral(({integrand}),{variable},({lower}),({upper}))"
                            ));
                        } else {
                            let Some((variable, lower)) = lower.split_once('=') else {
                                return Err("Use a lower bound such as n=1.".into());
                            };
                            out.push_str(&format!(
                                "{}(({body}),{variable},({lower}),({upper}))",
                                if cmd == "sum" { "sum" } else { "product" }
                            ));
                        }
                        return Ok(out);
                    }
                    "sqrt" => {
                        if c.get(i) == Some(&'[') {
                            i += 1;
                            let start = i;
                            while i < c.len() && c[i] != ']' {
                                i += 1;
                            }
                            let n: String = c[start..i].iter().collect();
                            i += 1;
                            let a = group(c, &mut i, depth)?;
                            out.push_str(&format!("root(({a}),({n}))"));
                        } else {
                            let a = group(c, &mut i, depth)?;
                            out.push_str(&format!("sqrt({a})"));
                        }
                    }
                    "operatorname" | "mathrm" | "text" => {
                        out.push(' ');
                        out.push_str(&group(c, &mut i, depth)?);
                        out.push(' ');
                    }
                    "cdot" | "times" => out.push('*'),
                    "div" => out.push('/'),
                    "le" | "leq" => out.push_str("<="),
                    "ge" | "geq" => out.push_str(">="),
                    "ne" | "neq" => out.push_str("!="),
                    "pi" => out.push_str(" pi "),
                    "theta" => out.push_str(" theta "),
                    "infty" => out.push_str(" infinity "),
                    "lbrace" => out.push('{'),
                    "rbrace" => out.push('}'),
                    "vert" | "lvert" | "rvert" => out.push('|'),
                    "ldots" | "dots" => out.push_str("..."),
                    "prime" => out.push('\''),
                    _ => {
                        out.push(' ');
                        out.push_str(&cmd);
                    }
                }
            } else if ch == '^' && c.get(i) == Some(&'{') {
                let power = group(c, &mut i, depth)?;
                out.push_str(&format!("^({power})"));
            } else if ch == '_' {
                let sub = group(c, &mut i, depth)?;
                out.push('_');
                out.push_str(&sub.replace(['(', ')', ' '], ""));
                out.push(' ');
            } else {
                out.push(match ch {
                    '−' | '–' => '-',
                    '×' | '·' => '*',
                    '÷' => '/',
                    'π' => {
                        out.push_str(" pi ");
                        continue;
                    }
                    'θ' => {
                        out.push_str(" theta ");
                        continue;
                    }
                    '≤' => {
                        out.push_str("<=");
                        continue;
                    }
                    '≥' => {
                        out.push_str(">=");
                        continue;
                    }
                    _ => ch,
                });
            }
        }
        Ok(out)
    }
    norm(&chars, 0)
}

fn lex(input: &str) -> Result<Vec<Tok>, String> {
    let c: Vec<char> = input.chars().collect();
    let mut i = 0;
    let mut out = Vec::new();
    while i < c.len() {
        let ch = c[i];
        if ch.is_whitespace() {
            i += 1;
            continue;
        }
        if ch == '.' && c.get(i + 1) == Some(&'.') {
            while c.get(i) == Some(&'.') {
                i += 1;
            }
            out.push(Tok::Dots);
            continue;
        }
        if ch.is_ascii_digit() || (ch == '.' && c.get(i + 1).is_some_and(|x| x.is_ascii_digit())) {
            let start = i;
            i += 1;
            while i < c.len()
                && (c[i].is_ascii_digit() || (c[i] == '.' && c.get(i + 1) != Some(&'.')))
            {
                i += 1;
            }
            if c.get(i) == Some(&'E') {
                i += 1;
                if matches!(c.get(i), Some('+' | '-')) {
                    i += 1;
                }
                while i < c.len() && c[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let s: String = c[start..i].iter().collect();
            out.push(Tok::Num(s.parse().map_err(|_| "Check this number.")?));
            continue;
        }
        if ch.is_alphabetic() {
            let start = i;
            i += 1;
            while i < c.len() && c[i].is_alphabetic() {
                i += 1;
            }
            let word: String = c[start..i].iter().collect();
            if builtin(&word) || ["pi", "theta", "infinity", "ans"].contains(&word.as_str()) {
                out.push(Tok::Id(word));
            } else {
                for x in word.chars() {
                    out.push(Tok::Id(x.to_string()));
                }
            }
            while c.get(i).is_some_and(|v| v.is_whitespace()) {
                i += 1;
            }
            if c.get(i) == Some(&'_') {
                i += 1;
                let start = i;
                while i < c.len() && c[i].is_alphanumeric() {
                    i += 1;
                }
                if let Some(Tok::Id(s)) = out.last_mut() {
                    s.push('_');
                    s.extend(c[start..i].iter());
                }
            }
            continue;
        }
        i += 1;
        out.push(match ch {
            '(' | '[' | '{' => Tok::L(ch),
            ')' | ']' | '}' => Tok::R(ch),
            ',' => Tok::Comma,
            ':' => Tok::Colon,
            '+' | '-' | '*' | '/' | '^' | '=' | '<' | '>' | '!' | '~' | '%' | '|' | '.' | '\'' => {
                let mut s = ch.to_string();
                if ['<', '>', '!'].contains(&ch) && c.get(i) == Some(&'=') {
                    s.push('=');
                    i += 1;
                }
                Tok::Op(s)
            }
            _ => return Err(format!("We couldn't understand ‘{ch}’.")),
        });
    }
    out.push(Tok::End);
    Ok(out)
}

pub fn parse(input: &str) -> Result<Expr, String> {
    let text = normalize(input)?;
    let mut parser = Parser {
        tokens: lex(&text)?,
        pos: 0,
        depth: 0,
    };
    let expr = parser.expression(0)?;
    if parser.peek() != &Tok::End {
        return Err("Check the end of this expression.".into());
    }
    Ok(expr)
}

struct Parser {
    tokens: Vec<Tok>,
    pos: usize,
    depth: usize,
}
impl Parser {
    fn peek(&self) -> &Tok {
        self.tokens.get(self.pos).unwrap_or(&Tok::End)
    }
    fn next(&mut self) -> Tok {
        let t = self.peek().clone();
        self.pos += 1;
        t
    }
    fn close(&mut self, ch: char) -> Result<(), String> {
        if self.next() == Tok::R(ch) {
            Ok(())
        } else {
            Err("Finish the brackets in this expression.".into())
        }
    }
    fn expression(&mut self, min: u8) -> Result<Expr, String> {
        self.depth += 1;
        if self.depth > 80 {
            return Err("This expression is nested too deeply.".into());
        }
        let mut lhs = match self.next() {
            Tok::Num(n) => Expr::Num(n),
            Tok::Id(name) => {
                if self.peek() == &Tok::Op("'".into()) {
                    let mut order = 0;
                    while self.peek() == &Tok::Op("'".into()) {
                        self.next();
                        order += 1;
                    }
                    if order > 4 {
                        return Err("Use at most four derivative marks.".into());
                    }
                    let argument = if self.peek() == &Tok::L('(') {
                        self.next();
                        let mut args = self.args(')')?;
                        if args.len() != 1 {
                            return Err("A function derivative takes one argument.".into());
                        }
                        args.remove(0)
                    } else {
                        self.expression(21)?
                    };
                    let variable = Expr::Var("__derivative_variable".into());
                    let mut body = Expr::Call(name, vec![variable.clone()]);
                    for _ in 1..order {
                        body = Expr::Call(
                            "derivative".into(),
                            vec![body, variable.clone(), variable.clone()],
                        );
                    }
                    Expr::Call("derivative".into(), vec![body, variable, argument])
                } else if self.peek() == &Tok::L('(') {
                    self.next();
                    let args = self.args(')')?;
                    Expr::Call(name, args)
                } else if builtin(&name) {
                    let power = if self.peek() == &Tok::Op("^".into()) {
                        self.next();
                        Some(self.expression(31)?)
                    } else {
                        None
                    };
                    let arg = self.expression(21)?;
                    let inverse=power.as_ref().is_some_and(|p|matches!(p,Expr::Unary('-',n) if matches!(n.as_ref(),Expr::Num(v) if *v==1.)));
                    if inverse
                        && ["sin", "cos", "tan", "sec", "csc", "cot"].contains(&name.as_str())
                    {
                        Expr::Call(format!("arc{name}"), vec![arg])
                    } else {
                        let call = Expr::Call(name, vec![arg]);
                        if let Some(p) = power {
                            Expr::Binary("^".into(), Box::new(call), Box::new(p))
                        } else {
                            call
                        }
                    }
                } else {
                    Expr::Var(name)
                }
            }
            Tok::Op(s) if s == "-" || s == "+" => {
                Expr::Unary(s.chars().next().unwrap(), Box::new(self.expression(25)?))
            }
            Tok::Op(s) if s == "|" => {
                let x = self.expression(2)?;
                if self.next() != Tok::Op("|".into()) {
                    return Err("Finish the absolute value.".into());
                }
                Expr::Call("abs".into(), vec![x])
            }
            Tok::L('(') => {
                let x = self.expression(0)?;
                if self.peek() == &Tok::Comma {
                    self.next();
                    let y = self.expression(0)?;
                    self.close(')')?;
                    Expr::Point(Box::new(x), Box::new(y))
                } else {
                    self.close(')')?;
                    x
                }
            }
            Tok::L('[') => {
                if self.peek() == &Tok::R(']') {
                    self.next();
                    Expr::List(vec![])
                } else {
                    let first = self.expression(0)?;
                    if self.peek() == &Tok::Dots {
                        self.next();
                        let end = self.expression(0)?;
                        self.close(']')?;
                        Expr::Range(Box::new(first), Box::new(end), None)
                    } else {
                        let mut xs = vec![first];
                        while self.peek() == &Tok::Comma {
                            self.next();
                            if self.peek() == &Tok::Dots {
                                self.next();
                                if self.peek() == &Tok::Comma {
                                    self.next();
                                }
                                let end = self.expression(0)?;
                                self.close(']')?;
                                let second = if xs.len() == 2 {
                                    Some(Box::new(xs[1].clone()))
                                } else {
                                    None
                                };
                                self.depth -= 1;
                                return Ok(Expr::Range(
                                    Box::new(xs[0].clone()),
                                    Box::new(end),
                                    second,
                                ));
                            }
                            xs.push(self.expression(0)?);
                        }
                        self.close(']')?;
                        if xs.len() == 1 && matches!(&xs[0],Expr::Call(name,_) if name=="__for") {
                            xs.remove(0)
                        } else {
                            Expr::List(xs)
                        }
                    }
                }
            }
            Tok::L('{') => self.piecewise()?,
            _ => return Err("Finish the expression.".into()),
        };
        loop {
            if matches!(self.peek(),Tok::Id(n) if n=="for" || n=="with") {
                if min > 1 {
                    break;
                }
                let Tok::Id(operator) = self.next() else {
                    unreachable!()
                };
                let mut args = vec![lhs];
                loop {
                    let Tok::Id(name) = self.next() else {
                        return Err("Enter a variable after for.".into());
                    };
                    if builtin(&name) || self.next() != Tok::Op("=".into()) {
                        return Err("Use for variable = list.".into());
                    }
                    args.push(Expr::Var(name));
                    args.push(self.expression(2)?);
                    if self.peek() != &Tok::Comma {
                        break;
                    }
                    let start = self.pos;
                    if matches!(self.tokens.get(start + 1), Some(Tok::Id(_)))
                        && self.tokens.get(start + 2) == Some(&Tok::Op("=".into()))
                    {
                        self.next();
                    } else {
                        break;
                    }
                }
                let body = args.remove(0);
                lhs = if let Expr::Binary(op, left, right) = body {
                    if op == "=" || op == "~" {
                        args.insert(0, *right);
                        Expr::Binary(
                            op,
                            left,
                            Box::new(Expr::Call(format!("__{operator}"), args)),
                        )
                    } else {
                        args.insert(0, Expr::Binary(op, left, right));
                        Expr::Call(format!("__{operator}"), args)
                    }
                } else {
                    args.insert(0, body);
                    Expr::Call(format!("__{operator}"), args)
                };
                continue;
            }
            if self.peek() == &Tok::Op(".".into()) && 40 >= min {
                self.next();
                let Tok::Id(member) = self.next() else {
                    return Err("Enter a distribution function after the dot.".into());
                };
                let mut args = vec![lhs];
                if self.peek() == &Tok::L('(') {
                    self.next();
                    args.extend(self.args(')')?);
                }
                lhs = Expr::Call(member, args);
                continue;
            }
            if self.peek() == &Tok::Op("!".into()) && 40 >= min {
                self.next();
                lhs = Expr::Call("factorial".into(), vec![lhs]);
                continue;
            }
            if self.peek() == &Tok::Op("%".into()) && 40 >= min {
                self.next();
                lhs = Expr::Binary("/".into(), Box::new(lhs), Box::new(Expr::Num(100.)));
                continue;
            }
            if self.peek() == &Tok::L('[') && 40 >= min {
                self.next();
                let idx = self.expression(0)?;
                self.close(']')?;
                lhs = Expr::Index(Box::new(lhs), Box::new(idx));
                continue;
            }
            if self.peek() == &Tok::L('{') && 5 >= min {
                self.next();
                let condition = self.expression(0)?;
                self.close('}')?;
                lhs = Expr::Restrict(Box::new(lhs), Box::new(condition));
                continue;
            }
            let (op, left, right, implicit) = match self.peek() {
                Tok::Op(s) => match s.as_str() {
                    "=" | "~" => (s.clone(), 1, 2, false),
                    "<" | ">" | "<=" | ">=" | "!=" => (s.clone(), 4, 5, false),
                    "+" | "-" => (s.clone(), 10, 11, false),
                    "*" | "/" => (s.clone(), 20, 21, false),
                    "^" => (s.clone(), 30, 30, false),
                    _ => break,
                },
                Tok::Id(_) | Tok::Num(_) | Tok::L('(') => ("*".into(), 20, 21, true),
                _ => break,
            };
            if left < min {
                break;
            }
            if !implicit {
                self.next();
            }
            let rhs = self.expression(right)?;
            lhs = Expr::Binary(op, Box::new(lhs), Box::new(rhs));
        }
        self.depth -= 1;
        Ok(lhs)
    }
    fn args(&mut self, close: char) -> Result<Vec<Expr>, String> {
        let mut args = vec![];
        if self.peek() == &Tok::R(close) {
            self.next();
            return Ok(args);
        }
        loop {
            args.push(self.expression(0)?);
            if args.len() > 1024 {
                return Err("Too many arguments.".into());
            }
            if self.peek() == &Tok::Comma {
                self.next();
            } else {
                break;
            }
        }
        self.close(close)?;
        Ok(args)
    }
    fn piecewise(&mut self) -> Result<Expr, String> {
        let mut cases = vec![];
        let mut fallback = None;
        loop {
            let a = self.expression(0)?;
            if self.peek() == &Tok::Colon {
                self.next();
                let b = self.expression(0)?;
                cases.push((a, b));
            } else {
                fallback = Some(Box::new(a));
            }
            if self.peek() == &Tok::Comma {
                self.next();
            } else {
                break;
            }
        }
        self.close('}')?;
        Ok(Expr::Piecewise(cases, fallback))
    }
}
