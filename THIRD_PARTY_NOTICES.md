# Third-party notices

## Chinese pinyin lookup data

`miniprogram/services/pinyin-data.ts` contains a compact per-character pinyin lookup table generated from the transliteration output of `text-unidecode` 1.3. The upstream project is available at <https://github.com/kmike/text-unidecode> and is dual licensed under the Artistic License or GPL. This project includes the generated lookup data only, not the upstream library code. The app-specific surname reading overrides are maintained in `miniprogram/services/pinyin.ts`.
