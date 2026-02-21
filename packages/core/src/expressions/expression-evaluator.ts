/**
 * Safe recursive descent expression evaluator.
 * No eval(), no Function(), no code generation.
 *
 * Supports:
 *   - Numbers: 42, 3.14, -1
 *   - Operators: + - * / % **
 *   - Parentheses: (expr)
 *   - Math functions: sin, cos, tan, abs, min, max, floor, ceil, round, sqrt, pow, clamp, sign, log
 *   - Constants: pi, tau, e
 *   - Context variables: t, frame, duration, progress
 *   - Comparison: <, >, <=, >=, ==, !=
 *   - Ternary: condition ? trueExpr : falseExpr
 */

/** Context variables available during expression evaluation */
export interface ExpressionContext {
  /** Eased progress 0–1 */
  t: number;
  /** Raw progress 0–1 (before easing) */
  progress: number;
  /** Current frame number */
  frame: number;
  /** Delta duration in frames */
  duration: number;
}

// ── Tokenizer ───────────────────────────────────────────────

type TokenType =
  | "number"
  | "ident"
  | "op"
  | "lparen"
  | "rparen"
  | "comma"
  | "question"
  | "colon"
  | "compare"
  | "eof";

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    // Whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // Numbers
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let num = "";
      while (i < expr.length && ((expr[i] >= "0" && expr[i] <= "9") || expr[i] === ".")) {
        num += expr[i++];
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    // Identifiers (variables, functions, constants)
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let id = "";
      while (i < expr.length && ((expr[i] >= "a" && expr[i] <= "z") || (expr[i] >= "A" && expr[i] <= "Z") || (expr[i] >= "0" && expr[i] <= "9") || expr[i] === "_")) {
        id += expr[i++];
      }
      tokens.push({ type: "ident", value: id });
      continue;
    }

    // Comparison operators (must check before single-char ops)
    if (ch === "<" || ch === ">" || ch === "!" || ch === "=") {
      if (i + 1 < expr.length && expr[i + 1] === "=") {
        tokens.push({ type: "compare", value: ch + "=" });
        i += 2;
        continue;
      }
      if (ch === "<" || ch === ">") {
        tokens.push({ type: "compare", value: ch });
        i++;
        continue;
      }
    }

    // Power operator
    if (ch === "*" && i + 1 < expr.length && expr[i + 1] === "*") {
      tokens.push({ type: "op", value: "**" });
      i += 2;
      continue;
    }

    // Operators
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }

    // Grouping and function calls
    if (ch === "(") { tokens.push({ type: "lparen", value: "(" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "rparen", value: ")" }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma", value: "," }); i++; continue; }

    // Ternary
    if (ch === "?") { tokens.push({ type: "question", value: "?" }); i++; continue; }
    if (ch === ":") { tokens.push({ type: "colon", value: ":" }); i++; continue; }

    throw new Error(`Expression: unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

// ── Parser + Evaluator ──────────────────────────────────────

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  tau: Math.PI * 2,
  TAU: Math.PI * 2,
  e: Math.E,
  E: Math.E,
};

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sqrt: Math.sqrt,
  sign: Math.sign,
  log: Math.log,
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  pow: (a, b) => Math.pow(a, b),
  clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
};

class Parser {
  private tokens: Token[];
  private pos = 0;
  private ctx: ExpressionContext;

  constructor(tokens: Token[], ctx: ExpressionContext) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(expectedType?: TokenType): Token {
    const tok = this.tokens[this.pos++];
    if (expectedType && tok.type !== expectedType) {
      throw new Error(`Expression: expected ${expectedType} but got ${tok.type} '${tok.value}'`);
    }
    return tok;
  }

  /** Entry: ternary (lowest precedence) */
  parse(): number {
    const result = this.parseTernary();
    if (this.peek().type !== "eof") {
      throw new Error(`Expression: unexpected token '${this.peek().value}'`);
    }
    return result;
  }

  /** ternary: comparison ? expr : expr */
  private parseTernary(): number {
    const condition = this.parseComparison();
    if (this.peek().type === "question") {
      this.consume(); // ?
      const trueVal = this.parseTernary();
      this.consume("colon"); // :
      const falseVal = this.parseTernary();
      return condition ? trueVal : falseVal;
    }
    return condition;
  }

  /** comparison: additive (< | > | <= | >= | == | !=) additive */
  private parseComparison(): number {
    let left = this.parseAdditive();
    while (this.peek().type === "compare") {
      const op = this.consume().value;
      const right = this.parseAdditive();
      switch (op) {
        case "<": left = left < right ? 1 : 0; break;
        case ">": left = left > right ? 1 : 0; break;
        case "<=": left = left <= right ? 1 : 0; break;
        case ">=": left = left >= right ? 1 : 0; break;
        case "==": left = left === right ? 1 : 0; break;
        case "!=": left = left !== right ? 1 : 0; break;
      }
    }
    return left;
  }

  /** additive: multiplicative (('+' | '-') multiplicative)* */
  private parseAdditive(): number {
    let left = this.parseMultiplicative();
    while (this.peek().type === "op" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.consume().value;
      const right = this.parseMultiplicative();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  /** multiplicative: power (('*' | '/' | '%') power)* */
  private parseMultiplicative(): number {
    let left = this.parsePower();
    while (this.peek().type === "op" && (this.peek().value === "*" || this.peek().value === "/" || this.peek().value === "%")) {
      const op = this.consume().value;
      const right = this.parsePower();
      if (op === "*") left = left * right;
      else if (op === "/") left = right !== 0 ? left / right : 0;
      else left = left % right;
    }
    return left;
  }

  /** power: unary ('**' unary)* (right-associative) */
  private parsePower(): number {
    const base = this.parseUnary();
    if (this.peek().type === "op" && this.peek().value === "**") {
      this.consume();
      const exp = this.parsePower(); // right-associative
      return Math.pow(base, exp);
    }
    return base;
  }

  /** unary: ('-' | '+') unary | primary */
  private parseUnary(): number {
    if (this.peek().type === "op" && (this.peek().value === "-" || this.peek().value === "+")) {
      const op = this.consume().value;
      const val = this.parseUnary();
      return op === "-" ? -val : val;
    }
    return this.parsePrimary();
  }

  /** primary: number | ident | function(args) | '(' expr ')' */
  private parsePrimary(): number {
    const tok = this.peek();

    // Number literal
    if (tok.type === "number") {
      this.consume();
      return parseFloat(tok.value);
    }

    // Identifier: constant, context variable, or function
    if (tok.type === "ident") {
      this.consume();
      const name = tok.value;

      // Function call
      if (this.peek().type === "lparen") {
        this.consume(); // (
        const args: number[] = [];
        if (this.peek().type !== "rparen") {
          args.push(this.parseTernary());
          while (this.peek().type === "comma") {
            this.consume(); // ,
            args.push(this.parseTernary());
          }
        }
        this.consume("rparen"); // )

        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`Expression: unknown function '${name}'`);
        return fn(...args);
      }

      // Constant
      if (name in CONSTANTS) return CONSTANTS[name];

      // Context variable
      if (name in this.ctx) return (this.ctx as unknown as Record<string, number>)[name];

      throw new Error(`Expression: unknown variable '${name}'`);
    }

    // Parenthesized expression
    if (tok.type === "lparen") {
      this.consume(); // (
      const val = this.parseTernary();
      this.consume("rparen"); // )
      return val;
    }

    throw new Error(`Expression: unexpected token '${tok.value}'`);
  }
}

// ── Public API ──────────────────────────────────────────────

/**
 * Check if a value is an expression object { expr: string }.
 */
export function isExpression(value: unknown): value is { expr: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "expr" in value &&
    typeof (value as Record<string, unknown>).expr === "string"
  );
}

/**
 * Evaluate an expression string with the given context.
 * Returns a number. Throws on syntax errors or unknown identifiers.
 */
export function evaluateExpression(expr: string, ctx: ExpressionContext): number {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens, ctx);
  return parser.parse();
}
