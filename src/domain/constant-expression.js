const MAX_EXPRESSION_LENGTH = 80;
const MAX_TOKEN_COUNT = 128;
const MAX_GROUP_DEPTH = 24;

function normalizeNotation(rawExpression) {
  return String(rawExpression ?? '')
    .trim()
    .replace(/\\left\b|\\right\b/g, '')
    .replace(/\\times\b|\\cdot\b/g, '*')
    .replace(/\\div\b/g, '/')
    .replace(/\\sqrt\b/g, '√')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\mathrm\s*\{e\}|\\operatorname\s*\{e\}/g, 'e')
    .replace(/\bpi\b/gi, 'π')
    .replace(/[{}〔〕]/g, (character) => ({ '{': '(', '}': ')', '〔': '(', '〕': ')' })[character])
    .replace(/[×⋅·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-');
}

function tokenize(expression) {
  const tokens = [];
  let cursor = 0;

  while (cursor < expression.length) {
    const character = expression[cursor];
    if (/\s/.test(character)) {
      cursor += 1;
      continue;
    }

    const numberMatch = expression.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (numberMatch) {
      tokens.push({ type: 'number', value: Number(numberMatch[0]) });
      cursor += numberMatch[0].length;
    } else if (character === 'π' || character === 'e') {
      tokens.push({ type: 'constant', value: character === 'π' ? Math.PI : Math.E });
      cursor += 1;
    } else if ('+-*/()√'.includes(character)) {
      tokens.push({ type: character });
      cursor += 1;
    } else {
      throw new SyntaxError(`不支援的字元：${character}`);
    }

    if (tokens.length > MAX_TOKEN_COUNT) throw new SyntaxError('算式過長');
  }

  return insertImplicitMultiplication(tokens);
}

function canEndFactor(token) {
  return token && ['number', 'constant', ')'].includes(token.type);
}

function canStartImplicitFactor(previous, token) {
  if (!token) return false;
  if (['constant', '(', '√'].includes(token.type)) return true;
  return previous?.type === ')' && token.type === 'number';
}

function insertImplicitMultiplication(tokens) {
  const expanded = [];
  for (const token of tokens) {
    const previous = expanded.at(-1);
    if (canEndFactor(previous) && canStartImplicitFactor(previous, token)) {
      expanded.push({ type: '*' });
    }
    expanded.push(token);
  }
  return expanded;
}

function ensureFinite(value) {
  if (!Number.isFinite(value)) throw new RangeError('算式結果不是有限數');
  return Object.is(value, -0) ? 0 : value;
}

export function evaluateConstantExpression(rawExpression) {
  const expression = normalizeNotation(rawExpression);
  if (!expression) throw new SyntaxError('請輸入算式');
  if (expression.length > MAX_EXPRESSION_LENGTH) throw new SyntaxError('算式過長');

  const tokens = tokenize(expression);
  if (!tokens.length) throw new SyntaxError('請輸入算式');
  let cursor = 0;
  let groupDepth = 0;

  const peek = () => tokens[cursor];
  const match = (type) => {
    if (peek()?.type !== type) return false;
    cursor += 1;
    return true;
  };

  function parsePrimary() {
    const token = peek();
    if (token?.type === 'number' || token?.type === 'constant') {
      cursor += 1;
      return token.value;
    }
    if (match('(')) {
      groupDepth += 1;
      if (groupDepth > MAX_GROUP_DEPTH) throw new SyntaxError('括號嵌套過深');
      if (peek()?.type === ')') throw new SyntaxError('括號內不能是空的');
      const value = parseExpression();
      if (!match(')')) throw new SyntaxError('括號未閉合');
      groupDepth -= 1;
      return value;
    }
    throw new SyntaxError('算式不完整');
  }

  function parseUnary() {
    if (match('+')) return parseUnary();
    if (match('-')) return ensureFinite(-parseUnary());
    if (match('√')) {
      const radicand = parseUnary();
      if (radicand < 0) throw new RangeError('負數無法取實數平方根');
      return ensureFinite(Math.sqrt(radicand));
    }
    return parsePrimary();
  }

  function parseTerm() {
    let value = parseUnary();
    while (peek()?.type === '*' || peek()?.type === '/') {
      const operator = tokens[cursor].type;
      cursor += 1;
      const right = parseUnary();
      if (operator === '/' && right === 0) throw new RangeError('不能除以 0');
      value = ensureFinite(operator === '*' ? value * right : value / right);
    }
    return value;
  }

  function parseExpression() {
    let value = parseTerm();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const operator = tokens[cursor].type;
      cursor += 1;
      const right = parseTerm();
      value = ensureFinite(operator === '+' ? value + right : value - right);
    }
    return value;
  }

  const result = ensureFinite(parseExpression());
  if (cursor !== tokens.length) {
    if (peek()?.type === ')') throw new SyntaxError('括號不平衡');
    throw new SyntaxError('算式格式無效');
  }
  return result;
}
