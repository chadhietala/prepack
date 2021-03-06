/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

/**
 * This file contains code that converts abstract models into concrete values.
 */

import type { Realm } from "../realm.js";
import type { BabelNodeSourceLocation } from "babel-types";
import {
  AbstractObjectValue,
  AbstractValue,
  BooleanValue,
  ConcreteValue,
  FunctionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  PrimitiveValue,
  ArrayValue,
  ECMAScriptSourceFunctionValue,
  Value,
} from "../values/index.js";
import * as t from "babel-types";
import invariant from "../invariant.js";
import type { FunctionBodyAstNode } from "../types.js";
import { CompilerDiagnostic } from "../errors.js";
import { EnumerableOwnProperties, Get } from "../methods/index.js";
import { Create } from "../singletons.js";

function reportCompileError(realm: Realm, message: string, loc: ?BabelNodeSourceLocation) {
  let error = new CompilerDiagnostic(message, loc, "PP9000", "RecoverableError");
  realm.handleError(error);
}

function createEmptyFunction(realm: Realm) {
  const concreteFunction = new ECMAScriptSourceFunctionValue(realm);
  concreteFunction.$ECMAScriptCode = t.blockStatement([]);
  concreteFunction.$FormalParameters = [];
  ((concreteFunction.$ECMAScriptCode: any): FunctionBodyAstNode).uniqueOrderedTag = realm.functionBodyUniqueTagSeed++;
  return concreteFunction;
}

/**
 * Convert abstract model value into concrete value.
 */
export function concretize(realm: Realm, val: Value): ConcreteValue {
  if (val instanceof ConcreteValue) {
    return val;
  }
  invariant(val instanceof AbstractValue);
  if (val.kind === "abstractConcreteUnion") {
    invariant(val.args.length > 0);
    return concretize(realm, val.args[0]);
  }
  const type = val.types.getType();
  if (val.types.isTop()) {
    return new UndefinedValue(realm);
  } else if ((type: any).prototype instanceof PrimitiveValue) {
    if (val.values.isTop()) {
      switch (type) {
        case StringValue:
          return new StringValue(realm, "__concreteModel");
        case NumberValue:
          return new NumberValue(realm, 42);
        case SymbolValue:
          return new SymbolValue(realm, new StringValue(realm, "__concreteModel"));
        case BooleanValue:
          return new BooleanValue(realm, true);
        case NullValue:
          return new NullValue(realm);
        case UndefinedValue:
          return new UndefinedValue(realm);
        default:
          invariant(false, "Not yet implemented");
      }
    } else {
      const values = val.values.getElements();
      invariant(values.length === 1, "Concrete model should only have one value");
      return values[0];
    }
  } else if (type === FunctionValue) {
    return createEmptyFunction(realm);
  } else if (type === ArrayValue) {
    reportCompileError(
      realm,
      "Emitting a concrete model for abstract array value is not supported yet.",
      val.expressionLocation
    );
  } else if (val instanceof AbstractObjectValue) {
    if (val.values.isTop()) {
      return new ObjectValue(realm);
    } else {
      let template = val.getTemplate();
      let valIsPartial = false;
      if (val.isPartialObject()) {
        valIsPartial = true;
        val.makeNotPartial();
      }
      let concreteObj = Create.ObjectCreate(realm, template.$GetPrototypeOf());
      try {
        let keys = EnumerableOwnProperties(realm, template, "key");
        for (let P of keys) {
          invariant(P instanceof StringValue);
          let newElement = Get(realm, template, P);
          Create.CreateDataProperty(realm, concreteObj, P, concretize(realm, newElement));
        }
      } finally {
        if (valIsPartial) {
          val.makePartial();
        }
      }
      return concreteObj;
    }
  }
  reportCompileError(
    realm,
    "Emitting a concrete model for this abstract value is not supported yet.",
    val.expressionLocation
  );
  // Return undefined to make flow happy.
  return new UndefinedValue(realm);
}
