import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default [
  {
    ignores: [
      "*.yml",
      "assets/**",
      "*.scss",
      "*.css",
      "*.mjs",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "package-lock.json",
      "*.yaml",
    ],
  },

  js.configs.recommended,

  ...fixupConfigRules(tseslint.configs.strictTypeChecked).map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  ...fixupConfigRules(tseslint.configs.stylisticTypeChecked).map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),

  ...fixupConfigRules(obsidianmd.configs.recommended),

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
        ecmaFeatures: {
          jsx: true,
        },
        jsDocParsingMode: "all",
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
        ...globals.node,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: fixupPluginRules(reactPlugin),
      "react-hooks": fixupPluginRules(reactHooksPlugin),
      obsidianmd: fixupPluginRules(obsidianmd),
    },
    rules: {
    
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "curly": ["error", "all"],
      "no-constant-condition": "error",
      "no-implicit-coercion": ["error", {
        boolean: true,
        number: true,
        string: true,
        disallowTemplateShorthand: true,
        allow: [],
      }],
      "no-return-assign": ["error", "except-parens"],
      "no-sequences": "error",
      "no-var": "error",
      "prefer-const": ["error", {
        destructuring: "all",
        ignoreReadBeforeAssign: false,
      }],
      "no-unreachable": "error",
      "no-cond-assign": ["error", "except-parens"],
      "no-void": ["error", { allowAsStatement: true }],
      "no-self-assign": ["error", { props: true }],
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unreachable-loop": "error",
      "no-fallthrough": "error",
      "guard-for-in": "error",
      "no-dupe-else-if": "error",
      "no-eval": "error",
      "no-new-func": "error",
      "no-extend-native": "error",
      "no-new-wrappers": "error",
      "no-new": "error",
      "no-new-native-nonconstructor": "error",
      "no-invalid-regexp": "error",
      "no-constructor-return": "error",
      "no-async-promise-executor": "error",
      "no-promise-executor-return": "error",
      "no-unmodified-loop-condition": "error",
      "accessor-pairs": "error",
      "no-labels": "error",
      "no-caller": "error",
      "no-with": "error",
      "no-octal": "error",
      "no-octal-escape": "error",
      "consistent-return": "off",
      "no-proto": "error",
      "no-sparse-arrays": "error",
      "no-compare-neg-zero": "error",
      "no-ex-assign": "error",
      "no-unsafe-optional-chaining": ["error", { disallowArithmeticOperators: true }],
      "no-constant-binary-expression": "error",
      "no-duplicate-case": "error",
      "no-useless-backreference": "error",
      "no-setter-return": "error",
      "no-lone-blocks": "error",
      "no-extra-boolean-cast": ["error", { enforceForInnerExpressions: true }],
      "symbol-description": "error",
      "valid-typeof": ["error", { requireStringLiterals: true }],
      "no-delete-var": "error",
      "no-unsafe-negation": ["error", { enforceForOrderingRelations: true }],
      "use-isnan": ["error", { enforceForSwitchCase: true, enforceForIndexOf: true }],
      "getter-return": "error",
      "for-direction": "error",
      "radix": "error",
      "no-debugger": "error",
      "no-irregular-whitespace": "error",
      "require-atomic-updates": "off",
      "no-alert": "error",
      "no-script-url": "error",
      "no-multi-str": "error",
      "no-useless-catch": "error",
      "no-useless-concat": "error",
      "no-useless-escape": "error",
      "no-useless-rename": "error",
      "no-useless-return": "error",
      "no-useless-call": "error",
      "no-useless-computed-key": ["error", { enforceForClassMembers: true }],
      "no-useless-constructor": "off",
      "no-param-reassign": ["error", { props: false }],
      "no-else-return": ["error", { allowElseIf: false }],
      "no-lonely-if": "error",
      "no-unneeded-ternary": ["error", { defaultAssignment: false }],
      "no-nested-ternary": "error",
      "no-bitwise": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-extra-label": "error",
      "no-label-var": "error",
      "no-shadow-restricted-names": "error",
      "no-undef-init": "error",
      "prefer-object-spread": "error",
      "prefer-object-has-own": "error",
      "prefer-template": "error",
      "prefer-rest-params": "error",
      "prefer-spread": "error",
      "prefer-arrow-callback": ["error", { allowNamedFunctions: false, allowUnboundThis: true }],
      "prefer-destructuring": ["error", {
        VariableDeclarator: { array: false, object: true },
        AssignmentExpression: { array: false, object: false },
      }],
      "prefer-numeric-literals": "error",
      "prefer-promise-reject-errors": "error",
      "prefer-regex-literals": ["error", { disallowRedundantWrapping: true }],
      "prefer-exponentiation-operator": "error",
      "object-shorthand": ["error", "always", {
        avoidQuotes: true,
        ignoreConstructors: false,
        avoidExplicitReturnArrows: false,
      }],
      "default-case-last": "error",
      "grouped-accessor-pairs": ["error", "getBeforeSet"],
      "no-implicit-globals": "error",
      "no-iterator": "error",
      "no-restricted-globals": ["error", "event", "fdescribe"],
      "no-throw-literal": "off",
      "no-object-constructor": "error",

      "no-unused-expressions": "off",
      "no-implied-eval": "off",
      "no-use-before-define": "off",
      "no-return-await": "off",
      "no-shadow": "off",
      "dot-notation": "off",
      "no-array-constructor": "off",
      "no-loss-of-precision": "off",
      "no-unused-vars": "off",
      "no-dupe-class-members": "off",
      "no-invalid-this": "off",
      "no-loop-func": "off",
      "no-redeclare": "off",
      "default-param-last": "off",
      "no-empty-function": "off",
      "require-await": "off",

      "@typescript-eslint/switch-exhaustiveness-check": ["error", {
        allowDefaultCaseForExhaustiveSwitch: true,
        requireDefaultForNonUnion: true,
      }],

      "@typescript-eslint/no-unnecessary-condition": "off",

      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/dot-notation": ["error", {
        allowKeywords: true,
        allowPrivateClassPropertyAccess: false,
        allowProtectedClassPropertyAccess: false,
        allowIndexSignaturePropertyAccess: true,
      }],
      "@typescript-eslint/no-shadow": ["error", {
        builtinGlobals: true,
        hoist: "all",
        allow: [],
        ignoreOnInitialization: false,
        ignoreTypeValueShadow: false,
        ignoreFunctionTypeParameterNameValueShadow: false,
      }],
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/prefer-readonly": "error",

      "@typescript-eslint/require-array-sort-compare": ["error", {
        ignoreStringArrays: false,
      }],

      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-enum-comparison": "error",
      "@typescript-eslint/no-explicit-any": ["error", {
        fixToUnknown: true,
        ignoreRestArgs: false,
      }],

      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "error",
      "@typescript-eslint/no-extra-non-null-assertion": "error",
      "@typescript-eslint/non-nullable-type-assertion-style": "off",

      "@typescript-eslint/consistent-type-assertions": ["error", {
        assertionStyle: "as",
        objectLiteralTypeAssertions: "never",
      }],

      "@typescript-eslint/no-unused-vars": ["error", {
        args: "all",
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      "@typescript-eslint/no-unused-expressions": ["error", {
        allowShortCircuit: true,
        allowTernary: true,
        allowTaggedTemplates: false,
        enforceForJSX: true,
      }],

      "@typescript-eslint/no-implied-eval": "error",

      "@typescript-eslint/no-use-before-define": ["error", {
        functions: false,
        classes: true,
        variables: true,
        enums: true,
        typedefs: true,
        ignoreTypeReferences: true,
      }],

      "@typescript-eslint/no-unnecessary-type-parameters": "error",
      "@typescript-eslint/no-unnecessary-type-constraint": "off",

      "@typescript-eslint/ban-ts-comment": ["error", {
        "ts-expect-error": "allow-with-description",
        "ts-ignore": true,
        "ts-nocheck": true,
        "ts-check": false,
        minimumDescriptionLength: 10,
      }],

      "@typescript-eslint/prefer-nullish-coalescing": ["error", {
        ignorePrimitives: {
          bigint: false,
          boolean: true,
          number: false,
          string: true,
        },
        ignoreMixedLogicalExpressions: false,
        ignoreConditionalTests: true,
      }],

      "@typescript-eslint/prefer-optional-chain": "error",

      "@typescript-eslint/no-meaningless-void-operator": ["error", {
        checkNever: true,
      }],

      "@typescript-eslint/no-confusing-void-expression": ["error", {
        ignoreArrowShorthand: true,
        ignoreVoidOperator: true,
      }],

      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowDirectConstAssertionInArrowFunctions: true,
        allowConciseArrowFunctionExpressionsStartingWithVoid: false,
        allowFunctionsWithoutTypeParameters: false,
        allowIIFEs: false,
      }],

      "@typescript-eslint/explicit-member-accessibility": ["error", {
        accessibility: "explicit",
        overrides: {
          constructors: "explicit",
        },
      }],

      "@typescript-eslint/explicit-module-boundary-types": ["error", {
        allowArgumentsExplicitlyTypedAsAny: false,
        allowDirectConstAssertionInArrowFunctions: true,
        allowHigherOrderFunctions: true,
        allowTypedFunctionExpressions: true,
      }],

      "@typescript-eslint/no-redundant-type-constituents": "error",
      "@typescript-eslint/no-duplicate-type-constituents": "error",
      "@typescript-eslint/no-dynamic-delete": "error",
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
      "@typescript-eslint/no-base-to-string": "error",

      "@typescript-eslint/restrict-template-expressions": ["error", {
        allowNumber: true,
        allowBoolean: true,
        allowAny: false,
        allowNullish: false,
        allowRegExp: false,
        allowNever: false,
      }],

      "@typescript-eslint/restrict-plus-operands": ["error", {
        allowAny: false,
        allowBoolean: false,
        allowNullish: false,
        allowNumberAndString: false,
        allowRegExp: false,
      }],

      "@typescript-eslint/prefer-includes": "error",
      "@typescript-eslint/prefer-string-starts-ends-with": "error",
      "@typescript-eslint/no-misused-spread": "error",
      "@typescript-eslint/prefer-for-of": "error",

      "@typescript-eslint/promise-function-async": ["error", {
        checkArrowFunctions: false,
        checkFunctionDeclarations: true,
        checkFunctionExpressions: true,
        checkMethodDeclarations: true,
      }],

      "@typescript-eslint/unified-signatures": "error",
      "@typescript-eslint/no-unnecessary-qualifier": "off",
      "@typescript-eslint/method-signature-style": ["error", "property"],
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/prefer-reduce-type-parameter": "error",
      "@typescript-eslint/prefer-as-const": "error",
      "@typescript-eslint/no-extraneous-class": ["error", {
        allowStaticOnly: true,
        allowWithDecorator: true,
      }],

      "@typescript-eslint/no-invalid-void-type": "error",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "error",

      "@typescript-eslint/no-empty-function": ["error", {
        allow: [
          "arrowFunctions",
          "private-constructors",
          "protected-constructors",
          "overrideMethods",
          "decoratedFunctions",
        ],
      }],

      "@typescript-eslint/no-confusing-non-null-assertion": "error",
      "@typescript-eslint/no-array-constructor": "error",
      "@typescript-eslint/no-loss-of-precision": "error",
      "@typescript-eslint/no-array-delete": "error",
      "@typescript-eslint/no-unnecessary-type-conversion": "off",
      "@typescript-eslint/no-wrapper-object-types": "error",
      "@typescript-eslint/prefer-literal-enum-member": ["error", {
        allowBitwiseExpressions: false,
      }],

      "@typescript-eslint/strict-boolean-expressions": ["error", {
        allowString: false,
        allowNumber: false,
        allowNullableObject: false,
        allowNullableBoolean: false,
        allowNullableString: false,
        allowNullableNumber: false,
        allowNullableEnum: false,
        allowAny: false,
      }],

      "@typescript-eslint/default-param-last": "error",
      "@typescript-eslint/init-declarations": "off",
      "@typescript-eslint/no-dupe-class-members": "error",
      "@typescript-eslint/no-invalid-this": "error",
      "@typescript-eslint/no-loop-func": "error",
      "@typescript-eslint/no-magic-numbers": "off",
      "@typescript-eslint/no-redeclare": "error",
      "@typescript-eslint/no-require-imports": "error",

      "@typescript-eslint/no-this-alias": ["error", {
        allowDestructuring: true,
      }],

      "@typescript-eslint/no-deprecated": "off",

      "@typescript-eslint/no-floating-promises": ["error", {
        ignoreVoid: true,
        ignoreIIFE: true,
      }],

      "@typescript-eslint/await-thenable": "error",

      "@typescript-eslint/no-misused-promises": ["error", {
        checksConditionals: true,
        checksVoidReturn: {
          arguments: true,
          attributes: false,
          properties: true,
          returns: true,
          variables: true,
        },
        checksSpreads: true,
      }],

      "@typescript-eslint/return-await": ["error", "always"],

      "@typescript-eslint/unbound-method": "off",

      "@typescript-eslint/no-useless-constructor": "error",

      "@typescript-eslint/consistent-type-imports": ["error", {
        prefer: "type-imports",
        fixStyle: "separate-type-imports",
        disallowTypeAnnotations: false,
      }],

      "@typescript-eslint/consistent-type-exports": ["error", {
        fixMixedExportsWithInlineTypeSpecifier: false,
      }],

      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],

      "@typescript-eslint/consistent-generic-constructors": ["error", "constructor"],

      "@typescript-eslint/consistent-indexed-object-style": ["error", "record"],

      "@typescript-eslint/no-import-type-side-effects": "error",

      "@typescript-eslint/no-inferrable-types": "off",

      "@typescript-eslint/naming-convention": ["error",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "forbid",
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "forbid",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["PascalCase", "UPPER_CASE"],
        },
        {
          selector: "property",
          format: null,
        },
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],

      "@typescript-eslint/prefer-enum-initializers": "error",
      "@typescript-eslint/prefer-return-this-type": "error",
      "@typescript-eslint/prefer-find": "error",
      "@typescript-eslint/prefer-regexp-exec": "error",
      "@typescript-eslint/no-unnecessary-template-expression": "off",
      "@typescript-eslint/no-mixed-enums": "error",
      "@typescript-eslint/no-duplicate-enum-values": "error",
      "@typescript-eslint/no-unsafe-declaration-merging": "error",
      "@typescript-eslint/no-unsafe-unary-minus": "error",

      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...reactHooksPlugin.configs.recommended.rules,

      "react-hooks/exhaustive-deps": "error",
      "react/jsx-no-leaked-render": ["error", { validStrategies: ["ternary"] }],
      "react/no-unstable-nested-components": ["error", { allowAsProps: false }],
      "react/no-array-index-key": "error",
      "react/jsx-key": ["error", {
        checkFragmentShorthand: true,
        checkKeyMustBeforeSpread: true,
        warnOnDuplicates: true,
      }],
      "react/no-unsafe": ["error", { checkAliases: true }],
      "react/no-direct-mutation-state": "error",
      "react/jsx-no-constructed-context-values": "error",
      "react/jsx-no-script-url": "error",
      "react/jsx-no-target-blank": ["error", {
        enforceDynamicLinks: "always",
        warnOnSpreadAttributes: true,
      }],
      "react/no-typos": "error",
      "react/no-unused-state": "error",
      "react/no-string-refs": ["error", { noTemplateLiterals: true }],
      "react/no-find-dom-node": "error",
      "react/no-children-prop": "error",
      "react/no-danger-with-children": "error",
      "react/void-dom-elements-no-children": "error",
      "react/no-unknown-property": "error",
      "react/no-is-mounted": "error",
      "react/no-redundant-should-component-update": "error",
      "react/no-access-state-in-setstate": "error",
      "react/no-will-update-set-state": "error",

      "react/display-name": "off",

      "react/button-has-type": "error",
      "react/iframe-missing-sandbox": "error",
      "react/jsx-no-duplicate-props": ["error", { ignoreCase: true }],
      "react/jsx-no-undef": "error",
      "react/jsx-no-useless-fragment": ["error", { allowExpressions: true }],
      "react/prop-types": "off",

      "react/checked-requires-onchange-or-readonly": "off",

      "react/destructuring-assignment": ["error", "always"],

      "react/forbid-prop-types": "off",

      "react/forward-ref-uses-ref": "error",
      "react/jsx-no-comment-textnodes": "error",

      "react/no-adjacent-inline-elements": "off",

      "react/no-arrow-function-lifecycle": "error",
      "react/no-deprecated": "error",
      "react/no-did-mount-set-state": "error",
      "react/no-did-update-set-state": "error",

      "react/no-object-type-as-default-prop": "error",

      "react/no-render-return-value": "error",
      "react/no-this-in-sfc": "error",

      "react/no-unescaped-entities": "off",

      "react/prefer-exact-props": "off",
      "react/prefer-read-only-props": "off",

      "react/prefer-stateless-function": "error",
      "react/style-prop-object": "error",

      "react/jsx-no-bind": ["error", {
        allowArrowFunctions: true,
        allowFunctions: false,
        allowBind: false,
      }],

      "react/no-unused-class-component-methods": "error",
      "react/no-namespace": "error",

      "react/hook-use-state": ["error", {
        allowDestructuredState: true,
      }],

      "react/no-invalid-html-attribute": "error",

      "react/no-danger": "error",
      "react/self-closing-comp": ["error", {
        component: true,
        html: true,
      }],
      "react/jsx-curly-brace-presence": ["error", {
        props: "never",
        children: "never",
        propElementValues: "always",
      }],
      "react/jsx-boolean-value": ["error", "never"],
      "react/jsx-fragments": ["error", "syntax"],
      "react/jsx-pascal-case": ["error", {
        allowAllCaps: false,
        allowLeadingUnderscore: false,
        allowNamespace: false,
      }],

      "react-hooks/rules-of-hooks": "error",
      "react-hooks/purity": "error",
      "react-hooks/immutability": "error",
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/unsupported-syntax": "error",
      "react-hooks/static-components": "error",
    },
  },

  {
    rules: {
      "obsidianmd/rule-custom-message": "off",
    },
  },
];
