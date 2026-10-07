# M3D1 Review and Hardening

## Scope

This review re-audits the complete M3D1 resolved `PaymentQuote` foundation after its first implementation. It is intentionally adversarial: the goal is not merely to confirm that happy-path tests pass, but to look for contract ambiguity, hostile-input leakage, architecture bypasses, milestone-scope drift, legacy-semantic mismatches, and CI gaps before M3D2 adds read-side affordability semantics.

The review does not begin M3D2. No resource-state reads, affordability calculations, queue feasibility, PaymentPlan construction, payment execution, special-payment families, or vanilla action cutover are introduced here.

## Result

The underlying M3D1 shape was sound: a resolved quote is inert ordered data, uses canonical typed IDs, preserves duplicate lines, accepts only positive finite payment amounts, and has no state or mutation authority.

The review nevertheless found several hardening gaps around that core. All material findings below are closed on the hardening branch.

## Findings closed

### 1. Dedicated architecture gate was not part of the explicit architecture command

The M3D1 boundary test existed and was discovered by the broad `npm test` suite, but `npm run test:architecture` did not execute the dedicated D1 fitness program directly.

That left an avoidable maintenance gap: a future test-runner change could have stopped enforcing the M3D1 architecture boundary while the named architecture command still reported success.

Hardening:

- `m3d1-payment-quote-boundary-fitness.cjs` is now explicitly wired into `npm run test:architecture`.

### 2. Malformed quote-line kinds were conflated with future unsupported families

The first implementation treated every non-`resource` kind as unsupported. That made malformed caller data such as `Bad Kind` indistinguishable from a syntactically valid family such as `prestige` that may become supported in a later reviewed slice.

Hardening:

- malformed kind syntax now produces `INVALID_PAYMENT_QUOTE_LINE_KIND`;
- syntactically valid but currently unsupported families produce `UNSUPPORTED_PAYMENT_QUOTE_LINE_KIND`;
- the kind grammar remains generic and first-party-neutral.

### 3. Caller-owned hostile scalar objects could escape through error details

`EngineContractError` freezes its detail record shallowly. If a validation error inserted a caller-owned Proxy/object as a detail value, later diagnostics or serialization could revisit that hostile object.

Hardening:

- invalid `kind`, `resourceId`, and `amount` diagnostics retain only safe primitive/type metadata;
- tests use throwing proxies and verify that diagnostic details remain serializable and do not retain the hostile input.

### 4. Wrong container shapes could also escape through inherited inert-reader diagnostics

The shared inert-data readers are appropriate for structural inspection, but some wrong-container errors can include the rejected container value in their diagnostic detail record. M3D1 should not expose caller-owned quote or quote-line containers through its public contract errors.

Hardening:

- M3D1 now performs its own safe array/plain-record preflight before delegating to the shared inert readers;
- wrong quote containers, array-as-line inputs, exotic line objects, hostile proxies, and revoked proxies fail with engine-owned scalar diagnostics;
- the shared inert-data subsystem is not broadened or changed by this slice.

### 5. The public production entry surface was not architecture-pinned tightly enough

Runtime tests confirmed that `payment-quote.mjs` exported `createPaymentQuote`, but there was no architecture rule ensuring that a future edit could not add a second production export or silently change the entry to an async/multi-argument form.

Hardening:

- the architecture gate pins `payment-quote.mjs` to one synchronous one-argument `createPaymentQuote(resolvedLines)` export;
- external production consumers must enter the package through that module.

### 6. Dynamic import could bypass the intended consumer shape

The first consumer rule rejected imports of internal cost modules but did not explicitly reject dynamically loading the public quote module.

Hardening:

- production consumers may reach M3D1 only through a static ESM import of `payment-quote.mjs`;
- dynamic imports into the cost package are rejected.

### 7. D1's non-goals were documented but not ratcheted

M3D1 is deliberately only the resolved quote language. Pure functions for affordability, queue/capacity feasibility, PaymentPlan/payment execution, or cost modifiers could otherwise have been added inside `src/engine/costs/**` without violating the original state/mutation guards.

Hardening:

- a D1-specific architecture vocabulary ratchet rejects ordinary code-level drift into those later responsibilities;
- comments and strings are masked for the scope check, so documentation text does not trigger false positives;
- this guard is intentionally temporary milestone scaffolding and must be consciously revised when M3D2 begins.

### 8. Legacy non-positive cost behavior needed a more precise compatibility decision

Legacy helpers accept zero ordinary-resource costs and also accept negative costs. Because payment subtracts the cost, a negative legacy cost can increase a resource. The new positive-only quote rule was therefore already a deliberate hardening choice rather than a literal transcription of helper permissiveness.

The review found one additional compatibility nuance: the legacy adjustment pipeline can round a positive declared price down to zero. A representative `Food: 1` cost under the lone-survivor adjustment resolves to `Food: 0`.

Hardening/contract clarification:

- negative resolved payment amounts remain invalid;
- zero is not represented as a PaymentQuote line;
- a bounded pre-M4 resolver must remove zero-valued resolved entries before quote construction;
- if a legitimate future mechanic semantically grants/refunds a resource, it must use an explicit semantic operation rather than a negative payment amount.

### 9. Scope-ratchet test itself had an identifier-boundary bug

The first hardening version of the D1 vocabulary guard correctly caught embedded camelCase terms such as `assessAffordability`, but one pattern required a prefix character and missed an identifier beginning exactly with `paymentPlan`.

CI exposed this immediately.

Hardening:

- the identifier patterns now allow the forbidden semantic term at the beginning, middle, or end of an identifier;
- the regression test remains in place.

### 10. Review edit briefly touched an unrelated Windows deploy command

While wiring the architecture command, a complete `package.json` replacement briefly omitted the existing final `gh-pages -d dist` portion of `deploy-win`.

This was detected during the review itself and restored immediately. The final hardening branch contains no intended deployment behavior change.

## Contract after review

M3D1 now owns only this transformation boundary:

```text
already-resolved, zero-filtered payment lines
    -> validate closed inert quote contract
    -> detach
    -> freeze
    -> PaymentQuote
```

For the current resource family:

```js
{
    kind: 'resource',
    resourceId: 'namespace:resource/local_id',
    amount: positiveFiniteNumber,
}
```

It does not own:

- declared legacy cost evaluation;
- modifier calculations or resource substitution;
- zero filtering prior to quote construction;
- current holdings/capacity reads;
- affordability;
- queue/payment feasibility;
- payment-source remapping;
- PaymentPlan construction;
- mutation/commit authority.

## Review conclusions for M3D2

M3D2 may now build on a stable quote language, but it should not weaken the D1 invariants.

The next slice should add read-only affordability and queue-payment-feasibility semantics behind explicit capabilities. In particular:

1. current affordability and queue/capacity feasibility must remain separate named questions;
2. repeated quote lines targeting the same eventual payment source must be evaluated cumulatively rather than independently;
3. structured failures should identify the relevant quote line/source without localized UI strings;
4. read capability adapters may bridge legacy state, but raw `global` must not cross into generic engine code;
5. M3D2 still must not create payment mutation authority or a PaymentPlan.

## Closure status

No remaining M3D1 design blocker was found after the hardening pass. The only intentional forward dependency is the already-documented resolver seam that must omit zero-valued adjusted costs before constructing a quote.

M3D1 should be considered closed only when the final hardening head passes the full repository test suite, explicit architecture gate, build/output checks, and browser smoke controls.
