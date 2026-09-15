use crate::{
    eval::{Definition, Environment, Value, factorial},
    parser::Expr,
};
use std::collections::{HashMap, HashSet};

#[derive(Clone)]
enum Op {
    Constant(f64),
    X,
    Y,
    T,
    Neg,
    Add,
    Sub,
    Mul,
    Div,
    Pow,
    Powi(i32),
    Lt,
    Le,
    Gt,
    Ge,
    Eq,
    Ne,
    Function(String, usize),
    JumpIfFalse(usize),
    Jump(usize),
}
pub struct Program {
    ops: Vec<Op>,
    degrees: bool,
}
impl Program {
    pub fn compile(env: &Environment, expr: &Expr) -> Option<Self> {
        let mut program = Self {
            ops: vec![],
            degrees: env.degrees,
        };
        if program
            .emit(env, expr, &HashMap::new(), &mut HashSet::new(), 0)
            .is_none()
            || program.ops.len() > 512
        {
            return None;
        }
        Some(program)
    }
    fn emit(
        &mut self,
        env: &Environment,
        expr: &Expr,
        bindings: &HashMap<String, Expr>,
        visiting: &mut HashSet<String>,
        depth: usize,
    ) -> Option<()> {
        if depth > 40 {
            return None;
        }
        match expr {
            Expr::Num(x) => self.ops.push(Op::Constant(*x)),
            Expr::Var(n) => {
                if let Some(v) = bindings.get(n) {
                    return self.emit(env, v, &HashMap::new(), visiting, depth + 1);
                }
                if let Some(Value::Scalar(x)) = env.values.get(n) {
                    self.ops.push(Op::Constant(*x));
                } else {
                    match n.as_str() {
                        "x" => self.ops.push(Op::X),
                        "y" => self.ops.push(Op::Y),
                        "t" | "theta" => self.ops.push(Op::T),
                        "pi" => self.ops.push(Op::Constant(std::f64::consts::PI)),
                        "e" => self.ops.push(Op::Constant(std::f64::consts::E)),
                        _ => {
                            if !visiting.insert(n.clone()) {
                                return None;
                            }
                            let Definition::Variable(e) = env.definitions.get(n)? else {
                                return None;
                            };
                            self.emit(env, e, bindings, visiting, depth + 1)?;
                            visiting.remove(n);
                        }
                    }
                }
            }
            Expr::Unary(op, e) => {
                self.emit(env, e, bindings, visiting, depth + 1)?;
                if *op == '-' {
                    self.ops.push(Op::Neg);
                }
            }
            Expr::Binary(op, a, b) => {
                if ["<", "<=", ">", ">="].contains(&op.as_str())
                    && matches!(a.as_ref(),Expr::Binary(prev,_,_) if ["<","<=",">",">="].contains(&prev.as_str()))
                {
                    return None;
                }
                self.emit(env, a, bindings, visiting, depth + 1)?;
                if op == "^" {
                    if let Expr::Num(n) = b.as_ref() {
                        if n.fract() == 0. && n.abs() < 100. {
                            self.ops.push(Op::Powi(*n as i32));
                            return Some(());
                        }
                    }
                }
                self.emit(env, b, bindings, visiting, depth + 1)?;
                self.ops.push(match op.as_str() {
                    "+" => Op::Add,
                    "-" => Op::Sub,
                    "*" => Op::Mul,
                    "/" => Op::Div,
                    "^" => Op::Pow,
                    "<" => Op::Lt,
                    "<=" => Op::Le,
                    ">" => Op::Gt,
                    ">=" => Op::Ge,
                    "=" => Op::Eq,
                    "!=" => Op::Ne,
                    _ => return None,
                });
            }
            Expr::Call(name, args) => {
                if let Some(Definition::Function(params, body)) = env.definitions.get(name) {
                    if params.len() != args.len() || !visiting.insert(name.clone()) {
                        return None;
                    }
                    let mut local = bindings.clone();
                    for (p, a) in params.iter().zip(args) {
                        local.insert(p.clone(), a.clone());
                    }
                    self.emit(env, body, &local, visiting, depth + 1)?;
                    visiting.remove(name);
                } else {
                    if ![
                        "sin",
                        "cos",
                        "tan",
                        "arcsin",
                        "arccos",
                        "arctan",
                        "sec",
                        "csc",
                        "cot",
                        "sinh",
                        "cosh",
                        "tanh",
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
                        "factorial",
                    ]
                    .contains(&name.as_str())
                    {
                        return None;
                    }
                    if args.is_empty() || args.len() > 8 {
                        return None;
                    }
                    if ["root", "mod"].contains(&name.as_str()) && args.len() != 2 {
                        return None;
                    }
                    if name == "round" && args.len() > 2 {
                        return None;
                    }
                    if !["root", "mod", "round", "min", "max"].contains(&name.as_str())
                        && args.len() != 1
                    {
                        return None;
                    }
                    for a in args {
                        self.emit(env, a, bindings, visiting, depth + 1)?;
                    }
                    self.ops.push(Op::Function(name.clone(), args.len()));
                }
            }
            Expr::Restrict(body, condition) => {
                self.emit(env, condition, bindings, visiting, depth + 1)?;
                let conditional = self.ops.len();
                self.ops.push(Op::JumpIfFalse(0));
                self.emit(env, body, bindings, visiting, depth + 1)?;
                let jump = self.ops.len();
                self.ops.push(Op::Jump(0));
                let fail = self.ops.len();
                self.ops.push(Op::Constant(f64::NAN));
                let end = self.ops.len();
                self.ops[conditional] = Op::JumpIfFalse(fail);
                self.ops[jump] = Op::Jump(end);
            }
            Expr::Piecewise(cases, fallback) => {
                let mut jumps = vec![];
                for (cond, body) in cases {
                    self.emit(env, cond, bindings, visiting, depth + 1)?;
                    let conditional = self.ops.len();
                    self.ops.push(Op::JumpIfFalse(0));
                    self.emit(env, body, bindings, visiting, depth + 1)?;
                    jumps.push(self.ops.len());
                    self.ops.push(Op::Jump(0));
                    self.ops[conditional] = Op::JumpIfFalse(self.ops.len());
                }
                if let Some(e) = fallback {
                    self.emit(env, e, bindings, visiting, depth + 1)?;
                } else {
                    self.ops.push(Op::Constant(f64::NAN));
                }
                for j in jumps {
                    self.ops[j] = Op::Jump(self.ops.len());
                }
            }
            _ => return None,
        }
        Some(())
    }
    pub fn eval(&self, x: f64, y: f64, t: f64) -> f64 {
        let mut stack = [0f64; 512];
        let mut sp = 0usize;
        let mut pc = 0usize;
        let factor = if self.degrees {
            std::f64::consts::PI / 180.
        } else {
            1.
        };
        while let Some(op) = self.ops.get(pc) {
            pc += 1;
            match op {
                Op::Constant(v) => {
                    stack[sp] = *v;
                    sp += 1;
                }
                Op::X => {
                    stack[sp] = x;
                    sp += 1;
                }
                Op::Y => {
                    stack[sp] = y;
                    sp += 1;
                }
                Op::T => {
                    stack[sp] = t;
                    sp += 1;
                }
                Op::Neg => stack[sp - 1] = -stack[sp - 1],
                Op::Powi(n) => stack[sp - 1] = stack[sp - 1].powi(*n),
                Op::JumpIfFalse(target) => {
                    sp -= 1;
                    if stack[sp] == 0. || stack[sp].is_nan() {
                        pc = *target;
                    }
                }
                Op::Jump(target) => pc = *target,
                Op::Function(n, count) => {
                    let a = stack[sp - count];
                    let b = if *count > 1 {
                        stack[sp - count + 1]
                    } else {
                        0.
                    };
                    let value = match n.as_str() {
                        "sin" => (a * factor).sin(),
                        "cos" => (a * factor).cos(),
                        "tan" => {
                            if (a * factor).cos().abs() < 1e-15 {
                                f64::NAN
                            } else {
                                (a * factor).tan()
                            }
                        }
                        "sec" => 1. / (a * factor).cos(),
                        "csc" => 1. / (a * factor).sin(),
                        "cot" => 1. / (a * factor).tan(),
                        "arcsin" => a.asin() / factor,
                        "arccos" => a.acos() / factor,
                        "arctan" => a.atan() / factor,
                        "sinh" => a.sinh(),
                        "cosh" => a.cosh(),
                        "tanh" => a.tanh(),
                        "sqrt" => a.sqrt(),
                        "root" => {
                            if b == 0. {
                                f64::NAN
                            } else if a < 0. && b.fract() == 0. && b % 2. != 0. {
                                -(-a).powf(1. / b)
                            } else {
                                a.powf(1. / b)
                            }
                        }
                        "abs" => a.abs(),
                        "ln" => a.ln(),
                        "log" => a.log10(),
                        "exp" => a.exp(),
                        "floor" => a.floor(),
                        "ceil" => a.ceil(),
                        "round" => {
                            let s = 10f64.powf(b);
                            (a * s).round() / s
                        }
                        "sign" => {
                            if a == 0. {
                                0.
                            } else {
                                a.signum()
                            }
                        }
                        "mod" => a.rem_euclid(b),
                        "min" => stack[sp - count..sp]
                            .iter()
                            .copied()
                            .fold(f64::INFINITY, f64::min),
                        "max" => stack[sp - count..sp]
                            .iter()
                            .copied()
                            .fold(f64::NEG_INFINITY, f64::max),
                        "factorial" => factorial(a),
                        _ => f64::NAN,
                    };
                    sp -= count;
                    stack[sp] = value;
                    sp += 1;
                }
                _ => {
                    sp -= 1;
                    let b = stack[sp];
                    let a = stack[sp - 1];
                    stack[sp - 1] = match op {
                        Op::Add => a + b,
                        Op::Sub => a - b,
                        Op::Mul => a * b,
                        Op::Div => {
                            if b == 0. {
                                f64::NAN
                            } else {
                                a / b
                            }
                        }
                        Op::Pow => a.powf(b),
                        Op::Lt => (a < b) as u8 as f64,
                        Op::Le => (a <= b) as u8 as f64,
                        Op::Gt => (a > b) as u8 as f64,
                        Op::Ge => (a >= b) as u8 as f64,
                        Op::Eq => (a == b) as u8 as f64,
                        Op::Ne => (a != b) as u8 as f64,
                        _ => f64::NAN,
                    };
                }
            }
        }
        if sp == 1 { stack[0] } else { f64::NAN }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_interpreter() {
        let env = Environment::default();
        for input in [
            "x^2-3x+2",
            "sin(x)+cos(x)",
            "abs(x){x<2}",
            "{x<0:-x,x^2}",
            "sqrt(x)",
            "1/x",
            "round(x,2)",
        ] {
            let ast = crate::parser::parse(input).unwrap();
            let p = Program::compile(&env, &ast).unwrap();
            for x in [-3., -0.1, 0., 0.5, 2., 5.] {
                let mut vars = HashMap::new();
                vars.insert("x".into(), Value::Scalar(x));
                let a = env.eval(&ast, &vars).unwrap().scalar().unwrap();
                let b = p.eval(x, 0., 0.);
                assert!(
                    (a - b).abs() < 1e-12 || a.is_nan() && b.is_nan(),
                    "{input} at {x}: {a} != {b}"
                );
            }
        }
    }
}
