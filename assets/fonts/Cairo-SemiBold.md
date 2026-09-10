Commercial Invoice/Contract labels use Cairo at weight 600, derived from the
existing Cairo-Variable.ttf. The original font and frozen proposal typography
are unchanged. Licensing remains OFL-Cairo.txt in this directory.

Reproduce with fontTools 4.64.0:

```sh
python -m fontTools.varLib.instancer assets/fonts/Cairo-Variable.ttf wght=600 slnt=0 --update-name-table --output assets/fonts/Cairo-SemiBold.ttf
```
