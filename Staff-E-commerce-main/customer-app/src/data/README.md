# Vietnam administrative units

`vietnamAdministrativeUnits.json` is a bundled snapshot from [Province Open API v2](https://provinces.open-api.vn/) (post-July 2025 administrative divisions), retrieved on 2026-11-09.

Source endpoint: `https://provinces.open-api.vn/api/v2/?depth=2`.

The snapshot contains 34 provinces/cities and 3,321 wards/communes/special administrative zones. Only unit names, codes and province-to-ward relationships are retained. The delivery address picker reads this file locally and does not send address searches to an external service.

To refresh, fetch the source endpoint, map each province to `{ code: String(code), name, wards: wards.map(w => ({ code: String(w.code), name: w.name })) }`, update the retrieval date, and run `node --test tests/addressSelection.test.js` from `customer-app`. Review any changes in counts before updating the dataset assertions.
