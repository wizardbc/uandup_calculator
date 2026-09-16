use std::cell::Cell;
use wasm_bindgen::prelude::*;
thread_local! {static INITIALIZED:Cell<bool>=const {Cell::new(false)};}
fn translate(mathml: &str, code: &str) -> Result<String, String> {
    if !["Nemeth", "UEB"].contains(&code) {
        return Err("Choose Nemeth or UEB.".into());
    }
    if mathml.len() > 100_000 {
        return Err("The expression is too long to translate.".into());
    }
    let initialized = INITIALIZED.with(Cell::get);
    if !initialized {
        libmathcat::interface::set_rules_dir("Rules").map_err(|e| e.to_string())?;
        libmathcat::interface::set_preference("Language", "en").map_err(|e| e.to_string())?;
        INITIALIZED.with(|v| v.set(true));
    }
    libmathcat::interface::set_preference("BrailleCode", code).map_err(|e| e.to_string())?;
    libmathcat::interface::set_preference("UEB_START_MODE", "Grade1").map_err(|e| e.to_string())?;
    libmathcat::interface::set_mathml(mathml).map_err(|e| e.to_string())?;
    libmathcat::interface::get_braille("").map_err(|e| e.to_string())
}
#[wasm_bindgen]
pub fn mathml_to_braille(mathml: &str, code: &str) -> Result<String, JsValue> {
    translate(mathml, code).map_err(|e| JsValue::from_str(&e))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn translates_both_math_codes() {
        let math = "<math><mn>1</mn><mo>+</mo><mn>1</mn></math>";
        let n = translate(math, "Nemeth").unwrap();
        let u = translate(math, "UEB").unwrap();
        assert!(!n.is_empty());
        assert!(!u.is_empty());
        assert_ne!(n, u);
        assert!(n.chars().all(|c| ('⠀'..='⣿').contains(&c) || c == ' '));
    }
}
