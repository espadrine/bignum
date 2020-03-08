export class Z {
	constructor(num, base = num.base || Z.defaultBase) {
		this.base = base;
		this._sign = 1;
		this._digits = [];
		if(!num) return this;

		if(isNumber(a)) {
			return Z._fromNum(num, this);
		} else if(typeof num == "string" || num instanceof String) {
			return Z._fromString(num, base, this);
		} else if(num instanceof Array) {
			return Z._fromArray(num, base);
		} else if(num instanceof Z) {
			this._digits = num._digits.slice();
			this._sign = num.sign;
			return this._normalize();
		} else {
			throw TypeError("Can't understand type of first argument.");
		}
	}

	clone() {
		return new Z(this);
	}

	adopt(that) {
		// Mutates this to have the same value as that.
		that = Z.lift(that);
		this._digits = that._digits;
		this.sign = that.sign;
		this.base = that.base;
		return this;
	}

	get length() {
		return this._digits.length;
	}

	get sign() {
		if(this.length == 0) return 0;
		return this._sign;
	}
	set sign(val) {
		return this._sign = Math.sign(val);
	}

	add(that) {
		// Fath-path special cases.
		if(Z.isZero(that)) return this;
		if(this.isZero()) return this.adopt(that);
		var digit;
		if(digit = Z._singleDigit(that, "allow-negative")) {
			if(this.sign == 1) this._digits[0] += digit;
			else this._digits[0] -= digit;
			if(this._digits[0] < 0 || this._digits[0] >= Z._innerBase) this._normalize();
			return this;
		}
		return this._add(Z.lift(that));
	}
	_add(that) {
		// Expects that to be a Z.
		// Non-destructive; this is just the shared slowpath for add/sub.
		var thisSign = this.sign;
		var thatSign = that.sign;
		var len = Math.max(this._digits.length, that._digits.length);
		if(thisSign == thatSign) {
			for(var i = 0; i < len; i++) {
				this._digits[i] = (this._digits[i]||0) + (that._digits[i]||0);
			}
			return this._normalize();
		}
		this.sign = 1;
		that.sign = 1;
		if(this.ge(that)) {
			for(var i = 0; i < len; i++) {
				this._digits[i] = (this._digits[i]||0) - (that._digits[i]||0);
			}
			this.sign = thisSign;
		} else {
			for(var i = 0; i < len; i++) {
				this._digits[i] = (that._digits[i]||0) - (this._digits[i]||0);
			}
			this.sign = thatSign;
		}
		that.sign = thatSign;
		return this._normalize();
	}

	sub(that) {
		// Fast-path special cases.
		if(Z.isZero(that)) return this;
		if(this.isZero()) return this.adopt(that).negate();
		var digit;
		if(digit = Z._singleDigit(that, "allow-negative")) {
			if(this.sign == 1) this._digits[0] -= digit;
			else this._digits[0] += digit;
			if(this._digits[0] < 0 || this._digits[0] >= Z._innerBase) this._normalize();
			return this;
		}
		// General case
		that = Z.lift(that).negate()
		this._add(that);
		that.negate(); // Restore original sign of that.
		return this;
	}

	_normalize(that) {
		// Put every digit back into the range [0, 2^25)
		var carry = 0;
		for(var i = 0; i < this.length; i++) {
			var digit = this._digits[i] + carry;
			carry = Math.floor(digit / Z._innerBase);
			this._digits[i] = (digit % Z._innerBase + Z._innerBase) % Z._innerBase;
		}
		// If final carry is negative, entire number was negative.
		if(carry < 0) {
			this.sign *= -1;
			carry = -carry - 1;
			for(var i = 0; i < this._digits.length; i++)
				this._digits[i] = Z._innerBase - this._digits[i] + (i == 0 ? 0 : -1);
		}
		// If there's any final carry, add more digits.
		while(carry > 0) {
			this._digits.push(carry % Z._innerBase);
			carry = Math.floor(carry / Z._innerBase);
		}
		// Drop any leading zeros.
		for(var i = this._digits.length-1; i>=0; i--) {
			if(this._digits[i] === 0)
				this._digits.pop();
			else
				break;
		}
		return this;
	}

	negate() {
		this.sign *= -1;
		return this;
	}

	mul(that) {
		// Fast-path special cases.
		if(this.isZero()) return this;
		if(Z.isZero(that)) { this._digits = []; return this; }
		var thisDigit, thatDigit;
		if(thatDigit = Z._singleDigit(that, "allow-negative")) {
			for(var i = 0; i < this._digits.length; i++)
				this._digits[i] *= thatDigit;
			return this._normalize();
		}
		// General case.
		that = Z.lift(that);
		var answerSign = this.sign * that.sign;
		var thisLength = this._digits.length;
		var thatLength = that._digits.length;
		var karatsubaBound = 25; // Experimentally determined, but could still be +- 5 or so.
		if(thisLength < karatsubaBound || thatLength < karatsubaBound) {
			var thisDigits = this._digits.slice();
			// Preload this with first multiplication.
			var thatDigit = that._digits[0];
			for(var i = 0; i < thisLength; i++)
				this._digits[i] *= thatDigit;
			// Manually push multiplied digits from thisClone directly into this, shifted appropriately.
			for(var thatIndex = 1; thatIndex < thatLength; thatIndex++) {
				var thatDigit = that._digits[thatIndex];
				for(var thisIndex = 0; thisIndex < thisLength; thisIndex++) {
					this._digits[thisIndex+thatIndex] = (this._digits[thisIndex+thatIndex]||0) + thisDigits[thisIndex] * thatDigit;
				}
				// I have enough wiggle room that 6 or 7 additions can be done without normalizing.
				if(thatIndex%6 == 0) this._normalize();
			}
		} else {
			// Karatsuba algorithm
			var chunkLength = Math.ceil(thisLength > thatLength ? thisLength/2 : thatLength/2);
			var a2 = Z._fromDigits(this._digits.slice(0, chunkLength));
			var a1 = Z._fromDigits(this._digits.slice(chunkLength));
			var b2 = Z._fromDigits(that._digits.slice(0, chunkLength));
			var b1 = Z._fromDigits(that._digits.slice(chunkLength));
			var z0 = Z.mul(a1, b1);
			var z2 = Z.mul(a2, b2);
			var z1 = a1.add(a2).mul(b1.add(b2)).sub(z0).sub(z2);
			var result = z0._shift(chunkLength*2).add(z1._shift(chunkLength)).add(z2);
			this._digits = result._digits;
		}
		this.sign = answerSign;
		return this;
	}

	_shift(digits) {
		if(this._digits.length == 0) return this;
		this._digits.reverse();
		for(var i = 0; i < digits; i++)
			this._digits.push(0);
		this._digits.reverse();
		return this;
	}

	pow(exp) {
		if(Z.isZero(exp)) return this.adopt(1);
		if(this.isZero()) return this; // 0^n = 0 (Except 0^0=1, caught by previous line.)
		var expDigit = Z.toNum(exp);
		if(expDigit == 1) return this;
		if(expDigit == 2) return this.square();
		var digit;
		if(expDigit && (digit = this._singleDigit())) {
			if(digit == 1) return this; // 1^n = 1
			// Power of 2 fast-paths
			for(var i = 1; i < 25; i++) {
				if(digit == Math.pow(2,i) && expDigit*i <= Number.MAX_SAFE_INTEGER) return this.adopt(Z._pow2(expDigit*i));
			}
			// Computable within JS num limits (answer is less than 2^53)
			if(	(digit == 3 && expDigit <= 33) ||
				(digit == 5 && expDigit <= 22) ||
				(digit == 6 && expDigit <= 20) ||
				(digit == 7 && expDigit <= 18) ||
				(digit == 9 && expDigit <= 16) ||
				(digit <= 11 && expDigit <= 15) ||
				(digit <= 13 && expDigit <= 14) ||
				(digit <= 16 && expDigit <= 13) ||
				(digit <= 21 && expDigit <= 12) ||
				(digit <= 28 && expDigit <= 11) ||
				(digit <= 39 && expDigit <= 10) ||
				(digit <= 59 && expDigit <= 9) ||
				(digit <= 98 && expDigit <= 8) ||
				(digit <= 190 && expDigit <= 7) ||
				(digit <= 456 && expDigit <= 6) ||
				(digit <= 1552 && expDigit <= 5) ||
				(digit <= 9741 && expDigit <= 4) ||
				(digit <= 208063 && expDigit <= 3))
				return this.adopt(Math.pow(digit, expDigit));
			// Otherwise, fall through to the slow path!
		}
		var originalBase = this.clone();
		var bitPattern = Z.digits(exp, 2);
		for(var i = 1; i < bitPattern.length; i++) {
			this.square();
			if(bitPattern[i] == 1) this.mul(originalBase);
		}
		return this;
	}

	_pow2(exp) {
		// Quick 2^n - this assumes that the innerBase is a power of 2 (specifically, 2^25).
		var n = new Z(0);
		while(exp >= 25) {
			n._digits.push(0);
			exp -= 25; // innerBase exponent
		}
		n._digits.push(Math.pow(2, exp));
		return n;
	}

	square() {
		if(this.isZero()) return this;
		this.sign = 1;  // Squaring always gives a positive number.
		var digit;
		if(digit = this._singleDigit()) {
			this._digits[0] *= this._digits[0];
			if(this._digits[0] >= Z._innerBase) this._normalize();
			return this;
		}
		if(this._digits.length < 10) {
			var self = this;
			var result = self._digits.map(function(d, i) {
				var digits = self._digits.map(function(d2){return d*d2;}).reverse();
				for(;i > 0;i--) digits.push(0);
				return Z._fromDigits(digits.reverse());
			}).reduce(Z.add, new Z(0));
			this._digits = result._digits;
			return this;
		}
		var chunkLength = Math.ceil(this._digits.length/2);
		var high = Z._fromDigits(this._digits.slice(chunkLength));
		this._digits.length = chunkLength; // truncate - one less copy!
		var low = this;
		var z0 = Z.square(high);
		var z2 = Z.square(low);
		var z1 = high.add(low).square().sub(z0).sub(z2);
		var result = z0._shift(chunkLength*2).add(z1._shift(chunkLength)).add(z2);
		this._digits = result._digits;
		return this;
	}

	powmod(exponent, modulus) {
		if(Z.isZero(modulus)) throw "Division by 0 is not allowed.";
		if(Z.isZero(exponent)) return this.adopt(1);
		if(this.isZero()) return this;
		if(Z.toNum(exponent) == 1) return this.mod(modulus);
		var digit;
		if(digit = Z._singleDigit(modulus)) {
			var base = this.mod(digit)._digits[0];
			var accum = base;
			var bitPattern = Z.digits(exponent, 2);
			for(var i = 1; i < bitPattern.length; i++) {
				accum = accum * accum % digit;
				if(bitPattern[i] == 1) accum = accum * base % digit;
			}
			return this.adopt(accum);
		}
		var base = this.mod(modulus).clone();
		var bitPattern = Z.digits(exponent, 2);
		for(var i = 1; i < bitPattern.length; i++) {
			this.square().mod(modulus);
			if(bitPattern[i] == 1) this.mul(base).mod(modulus);
		}
		return this;
	}

	divmod(divisor, modOrRem="rem") {
		if(Z.isZero(divisor)) throw "Division by 0 is not allowed.";
		if(this.isZero()) return [this, new Z(0)];
		if(Z._singleDigit(divisor, "allow-negative")) {
			divisor = Z._singleDigit(divisor, "allow-negative");
			if(this._singleDigit("allow-negative")) {
				var dividend = this._singleDigit("allow-negative");
				if(modOrRem == "rem") return [this.adopt(Math.trunc(dividend/divisor)), new Z(dividend % divisor)];
				else return [this.adopt(Math.floor(dividend/divisor)), new Z(((dividend % divisor)+divisor)%divisor)];
			}
			var mod = 0;
			for(var i = this.length-1; i >= 0; i--) {
				var digit = this._digits[i] + mod * Z._innerBase;
				mod = digit % divisor;
				this._digits[i] = Math.floor(digit / divisor);
			}
			if(mod < 0 && remainderPositive == "positive") mod += divisor;
			return [this._normalize(), new Z(mod)];
		} else {
			divisor = Z.lift(divisor);
			remainder = new Z(0);
			for(var i = this._digits.length -1; i >= 0; i--) {
				var digit = this._digits[i];
				remainder._digits.unshift(digit);
				if(remainder.lt(divisor)) {
					// Fast-path, since this'll be common and it's slow to find via binary-search.
					var factor = 0;
				} else {
					var factor = _divmodFindFactor(divisor, remainder, 1, Z._innerBase-1);
				}
				this._digits[i] = factor;
				remainder.sub(new Z(factor).mul(divisor)); // replace with mod later
			}
			this._normalize();
			remainder.sign = this.sign;
			this.sign *= divisor.sign;
			if(remainder.isNeg() && remainderPositive == "positive") remainder.add(divisor);
			return [this._normalize(), remainder];
		}
	}

	div(divisor) {
		return this.divmod(divisor)[0];
	}

	mod(modulus, remainderPositive) {
		if(Z.isZero(modulus)) throw "Division by 0 is not allowed.";
		if(this.isZero()) return this;
		var digit;
		if(digit = Z._singleDigit(modulus)) {
			if(this.toNum()) return this.adopt(this.toNum() % digit);
			accumulatedBaseMod = 1;
			var sum = 0;
			for(var i = 0; i < this._digits.length; i++) {
				sum = (this._digits[i]%digit * accumulatedBaseMod + sum) % digit;
				accumulatedBaseMod = accumulatedBaseMod * Z._innerBase % digit;
			}
			this._digits[0] = sum;
			this._digits.length = 1;
			if(remainderPositive == "positive")
				this.sign = 1;
			else if (this.sign == -1)
				this._digits[0] = digit - this._digits[0];
			return this;
		}
		// For now, just use the full divmod algo.
		// Complexity of multi-digit mod is high enough to not be worth implementing yet.
		return this.adopt(this.divmod(modulus, remainderPositive)[1]);
	}

	factorize() {
		let digit;
		if(digit = this._singleDigit()) {
			return Primes.factorize(digit);
		}
		let factors = new Map();
		let num = this.clone();
		let i = 0;
		for(let p of Primes.primes(Z)) {
			let count = new Z(0);
			while(Z.mod(num, p).isZero()) {
				count.add(1);
				num.div(p);
			}
			if(count.isPos())
				factors.set(new Z(p), count);
			if(num._singleDigit() === 1)
				return factors;
		}
	}

	lt(that) {
		that = new Z(that);
		if(this.sign != that.sign) return this.sign < that.sign;
		if(this._digits.length != that._digits.length) {
			if(this.sign == 1) return this._digits.length < that._digits.length;
			else return this._digits.length > that._digits.length;
		}
		for(var i = this.length - 1; i >= 0; i--) {
			if(this._digits[i] < that._digits[i])
				return true;
			if(this._digits[i] > that._digits[i])
				return false;
		}
		return false;
	}

	eq(that) {
		that = new Z(that);
		if(this.sign != that.sign) return false;
		if(this._digits.length != that._digits.length) return false;
		for(var i = 0; i < this.length; i++) {
			if(this._digits[i] != that._digits[i])
				return false;
		}
		return true;
	}

	ne(that) { return !this.eq(that); }
	ge(that) { return !this.lt(that); }
	le(that) { return this.eq(that) || this.lt(that); }
	gt(that) { return !this.le(that); }

	isZero() {
		for(var i = 0; i < this._digits.length; i++)
			if(this._digits[i] != 0) return false;
		return true;
	}

	_singleDigit(allowNegative) {
		// Many functions can be optimized for single-digit Zs.
		// If the Z is single-digit, returns that digit. This is a truthy value.
		// Note, this returns false for 0; use isZero() instead.
		if(this._digits.length == 1) {
			if(allowNegative === "allow-negative") return this._digits[0] * this.sign;
			if(this.sign == 1) return this._digits[0];
		}
		return false;
	}

	toNum() {
		// Converts the Z into a JS num, if possible; otherwise returns false.
		if(this.isZero()) return 0;
		if(this._singleDigit("allow-negative")) return this._singleDigit("allow-negative");
		if(this._digits.length == 2) return (this._digits[0] + this._digits[1]*Z._innerBase)*this.sign;
		if(this._digits.length == 3 && this._digits[3] < 8)
			return (this._digits[0] + this._digits[1]*Z._innerBase + this._digits[2]*Z._innerBase*Z._innerBase)*this.sign;
		return false;
	}

	valueOf() {
		var val = this.toNum();
		if(val !== false) return val;
		return NaN;
	}

	isPos() {
		return this.sign == 1;
	}

	isNeg() {
		return this.sign == -1;
	}

	digits(base) {
		base = Math.floor(base || this.base);
		var num = new Z(this);
		var digits = [];
		do {
			var result = num.divmod(base);
			digits.push(result[1]);
			num = result[0];
		} while(!num.isZero());
		return digits.reverse();
	}

	toString(base) {
		base = Math.floor(base || this.base);
		if(base < 2 || base > 36)
			throw TypeError("Can only toString a Z when 2 <= base <= 36.");
		var s;
		if(s = this._singleDigit("allow-negative")) return s;
		var result = this.digits(base).map(function(x){return x.toNum().toString(base);}).join('');
		if(this.sign == -1)
			result = "-" + result;
		return result;
	}

	__traceToString__() {
		return "Z("+(this.sign<0?'-':'+')+'['+this._digits.reverse()+"])";
	}
}

function _divmodFindFactor(factor1, product, low, high) {
	// Binary search to find largest n that satisfies `factor1 * n <= product`
	while(true) {
		var n = Math.ceil((low+high)/2);
		var candidateProduct = Z.mul(factor1, n);
		if(candidateProduct.gt(product)) {
			high = n-1; continue;
		} else if(Z.add(candidateProduct, factor1).gt(product)) {
			return n;
		} else {
			low = n+1; continue;
		}
	}
}

function isNumber(x) {
	return x instanceof Number || typeof x == "number";
}


Z.of = function(num) {
	return new Z(num);
}
Z.lift = function(num) {
	if(num instanceof Z) return num;
	return new Z(num);
}
Z._fromNum = function(num, z) {
	if(num < 0) {
		num *= -1;
		z.sign = -1;
	}
	if(num < Z._innerBase) {
		z._digits = [num];
		return z;
	} else if(num < Number.MAX_SAFE_INTEGER) {
		z._digits = [];
		while(num > 0) {
			z._digits.push(num % Z._innerBase);
			num = Math.floor(num / Z._innerBase);
		}
		return z;
	}
	throw TypeError("Number is too large to reliably generate a Z from.");
}
Z._fromString = function(num, base, z) {
	var sign = 1;
	if(num[0] == "-") {
		num = num.slice(1);
		sign = -1;
	}
	var digits = num.split('').map(function(x){
		var digit = parseInt(x,base);
		if(Number.isNaN(digit))
			throw TypeError('"'+num+'" is not a base '+base+' number.');
		return digit;
	});
	return Z._fromArray(digits, base, sign);
}
Z._fromArray = function(num, base, sign) {
	// Put the digits in LSD order.
	var digits = num.slice().reverse();
	// First, collect input digits together into a larger base,
	// as large as I can get without overshooting innerBase,
	// for better efficiency (less steps later).
	// Then, just use Z math to do the conversion for me;
	// nothing particularly clever going on here.
	var size = Math.floor(Math.log(Z._innerBase) / Math.log(base));
	var bigDigits = Math.ceil(digits.length / size);
	var pieces = [];
	for(var i = 0; i < bigDigits; i++) {
		var offset = i*size;
		var sum = 0;
		for(var j = 0; j < size; j++) {
			sum += (digits[offset+j]||0) * Math.pow(base, j);
		}
		pieces.push(new Z(sum).mul(new Z(base).pow(offset)));
	}
	var result = pieces.reduce(Z.add, new Z(0));
	result.sign = sign;
	return result;
}
Z._fromDigits = function(digits) {
	// This function does nothing intelligent.
	// It assumes that the digit array is in innerBase already.
	var result = new Z(0);
	result._digits = digits;
	return result;
}
Z._innerBase = Math.pow(2, 25);
Z.defaultBase = 10;
Z.sign = function(a) {
	if(isNumber(a)) {
		if(a < 0) return -1;
		if(a > 0) return 1;
		return 0;
	}
	return Z.lift(a).sign;
}
Z.add = function(a,b) {
	return new Z(a).add(b);
}
Z.sub = function(a,b) {
	return new Z(a).sub(b);
}
Z.negate = function(a) {
	return new Z(a).negate();
}
Z.mul = function(a,b) {
	return new Z(a).mul(b);
}
Z.pow = function(a,b) {
	return new Z(a).pow(b);
}
Z.square = function(a) {
	return new Z(a).square();
}
Z.powmod = function(a,b,c) {
	return new Z(a).powmod(b,c);
}
Z.divmod = function(a,b) {
	return new Z(a).divmod(b);
}
Z.div = function(a,b) {
	return new Z(a).divmod(b)[0];
}
Z.mod = function(a,b,remainderPositive) {
	return new Z(a).mod(b, remainderPositive);
}
Z.fact = function(num) {
	num = Z.toNum(num);
	if(num === false) throw "Keep your factorials less than Number.MAX_SAFE_INTEGER, please."
	var product = new Z(1);
	for(var i = 2; i <= num; i++)
		product.mul(i);
	return product;
}
Z.lt = function(a,b) { return Z.lift(a).lt(b); }
Z.le = function(a,b) { return Z.lift(a).le(b); }
Z.gt = function(a,b) { return Z.lift(a).gt(b); }
Z.ge = function(a,b) { return Z.lift(a).ge(b); }
Z.eq = function(a,b) { return Z.lift(a).eq(b); }
Z.ne = function(a,b) { return Z.lift(a).ne(b); }
Z.isZero = function(a) {
	if(isNumber(a)) return a == 0;
	return Z.lift(a).isZero();
}
Z._singleDigit = function(a, allowNegative) {
	if(isNumber(a) && a < Z._innerBase) {
		if(a > 0) return a;
		if(allowNegative == "allow-negative" && a > -Z._innerBase) return a;
	}
	return Z.lift(a)._singleDigit();
}
Z.toNum = function(a) {
	if(isNumber(a) && a >= -Number.MAX_SAFE_INTEGER && a <= Number.MAX_SAFE_INTEGER) return a;
	return Z.lift(a).toNum();
}
Z.isPos = function(a) {
	if(isNumber(a)) return a > 0;
	return Z.lift(a).isPos();
}
Z.isNeg = function(a) {
	if(isNumber(a)) return a < 0;
	return Z.lift(a).isNeg();
}
Z.adopt = function(a,b) {
	return Z.lift(a).adopt(b);
}
Z.digits = function(a, base) {
	return Z.lift(a).digits(base);
}
Z.toString = function(a, base) {
	if(isNumber(a)) return a.toString(base);
	return Z.lift(a).toString(base);
}
