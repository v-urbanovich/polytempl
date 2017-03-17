# polytempl

Simple plugin to create basic template for Polymer elements and build separate element files into one html file

## Install

    npm install polytempl --save-dev

## Template  generator

You can use **polytempl** to create basic template for Polymer elements.

    polytempl create <element_name> [options]

If no option provided this command will create directory and html file named `<element_name>` representing basic polymer element template.

### Options
- `-h`|`--help`: print help information
- `--path`: path to directory in which you want to create template (process.cwd() by default)
- `-j`|`--script`: export script to separate js file, replace script tag with `<!-- inject scripts './<element_name>.js' -->` 
- `-s`|`--styles`: export styles to separate css file, replace script tag with `<!-- inject styles './<element_name>.css' -->`. 
You can set this option to scss|less if you want to use preprocessors(css by default).
- `-i`|`--imports`: add `<!-- import [polymer]-->` line to html template file to use it in polytempl builder 

Example:

    polytempl create new-element ./my-elements -ijs scss
   
will create `new-element` directory in `./my-elements` with files `new-element.html`, `new-element.js`, `new-element.scss` including basic template code.

`new-element.js`:

```js
'use strict';

Polytempl({
    is: 'new-element'
})
```

`new-element.html`:

```html
<!-- import [polymer]-->

<dom-module id="new-element">
    <template>
        <!-- inject styles './new-element.scss'-->


    </template>

    <!-- inject script './new-element.js'-->
</dom-module>
```

`new-element.scss`:

```scss
:host {
    position: relative;
    display: block;
}
```

## Polytempl builder

### Styles and scripts

Polytempl builder will replace `<!-- inject styles 'path_to_your_file'-->` and `<!-- inject script 'path_to_your_file'-->` with `<style>**file content**</style>` or `<style>**file content**</style>` tag. Path must be relative to html file.

### Imports

Polytempl helps you to manage your imports. 
For example if you have following structure:
```
|- my-elements/
    |- first/
        |- element_1/
        |- element_2/
    |- second/
        |- element_3/
        |- element_4/
        |- another/
            |- element_5/
|- bower_components/
```
you can type `<!-- import [polymer, element_3, element_5, element_1, iron-icons]-->` and polytempl will resolve all paths and replace this with `<link rel="import" href="resolved_path">`

#### Usage
```js
var gulp = require('gulp');
var polytempl = require('polytempl');

gulp.task('build', function () {
  return gulp.src('./my-elements/**/*.html')
    .pipe(polytempl([process.cwd() + '/bower_components/']))
    .pipe(gulp.dest('./build'));
});

```

Polytempl will register all elements that you browse in `gulp.src`. You can pass in additional array of paths to options. If element that you try to import is not registered, polytempl will try to get it from `additional_path/element_name/element_name.html`. You can also specify more complex element name for additional paths.
 
For example you set `['/bower_components']` as additional path and want to import `<!--import [neon-animation]-->` element. Polytempl will try to get that element from `/bower_components/neon-animation/neon-animation.html`. 
If directory and file names aren't equal you can specify complex element name `<!--import [app-route/app-location]-->` and polytempl try to get that element from `/bower_components/app-route/app-location.html`.
