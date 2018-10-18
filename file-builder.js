'use strict';

const through2 = require('through2').obj;
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const gulp = require('gulp');
const webpackStream = require('webpack-stream');
const named = require('vinyl-named');
const plumber = require('gulp-plumber');
const notify = require('gulp-notify');

const STYLES_REG = /<!--\s*inject\s+styles\s+'\s*(.*\.scss|.*\.css|.*\.less|.*\.sass)\s*'\s*-->/g;
const SCRIPTS_REG = /<!--\s*inject\s+scripts\s+'(.*\.js)\s*'\s*-->/;
const IMPORTS_REG = /<!--\s*import\s*\[([\s\S]*?)]\s*-->/g;
const JS_IMPORTS_REG = /([\s*;]|^)import\s+[`'"*{\w]/g;

const defaultWebpackOptions = {
    watch: false,
    devtool: false,
    mode: 'development'
};

class Builder {
    constructor() {
        this._paths = {};
        this._files = [];
        this._imports = {};
    }

    _register(file, imports_obj) {
        this._paths[file.stem] = file.path;
        this._files.push(file);
        if (imports_obj && file.isBuffer()) {
            let imports = [];

            let result;
            while (result = IMPORTS_REG.exec(file.contents)) {
                result[1].split(/\s*,\s*/)
                    .map(function (name) {
                        return name.replace(/['\s]/g, '')
                    }).forEach((element) => {
                    imports.push(element)
                })
            }

            this._imports[file.stem] = imports;
        }
    }

    _inject(imports_obj) {
        if (imports_obj) {
            let shell_imports = getImports(this._imports, imports_obj.shell),
                fragments = {};

            imports_obj.fragments.forEach((name) => {
                let imports = [];
                getImports(this._imports, name).forEach((_import) => {
                    if (shell_imports.indexOf(_import) < 0) imports.push(_import);
                });
                fragments[name] = `<!-- import [${imports.join(', ')}]-->`;
            });
            shell_imports = `<!-- import [${shell_imports.join(', ')}]-->`;


            this._files.forEach((file) => {
                if (file.isBuffer()) {
                    if (file.stem !== imports_obj.shell && imports_obj.fragments.indexOf(file.stem) < 0) file.contents = Buffer.from(String(file.contents)
                        .replace(IMPORTS_REG, ''));
                    else if (file.stem === imports_obj.shell) {
                        file.contents = Buffer.from(String(file.contents).replace(IMPORTS_REG, shell_imports));
                    } else {
                        file.contents = Buffer.from(String(file.contents).replace(IMPORTS_REG, fragments[file.stem]));
                    }
                }
            });
        }

        let promise = Promise.resolve();
        this._files.forEach((file) => {
            if (!file.isBuffer()) { return; }

            const [match, filePath] = String(file.contents).match(SCRIPTS_REG) || [false];

            file.contents = Buffer.from(String(file.contents)
                .replace(STYLES_REG, injectStyles(file))
                .replace(IMPORTS_REG, injectImports(file, this._paths)));

            if (match) {
                const resolvedPath = path.resolve(file.dirname, filePath);
                promise = promise.then(() => injectScriptsText(resolvedPath, file, this.webpackOptions));
            }
        });

        return promise;
    }

    _clean(stream) {
        this._files.forEach((file) => {
            stream.push(file);
        });
        this._files = [];
    }

    start(custom_paths, reduce_imports, webpackOptions) {
        this._paths._custom_paths = custom_paths || [];
        this.webpackOptions = webpackOptions || defaultWebpackOptions;
        let builder = this;

        return through2(
            function (file, enc, callback) {
                builder._register(file, reduce_imports);
                callback()
            },
            function (callback) {
                builder
                    ._inject(reduce_imports)
                    .then(() => {
                        builder._clean(this);
                        callback();
                    });

            }
        )
    }
}

function injectStyles(file) {
    return function (s, filename) {
        const file_path = path.resolve(file.dirname, filename);
        let exist = fs.existsSync(file_path);
        if (!exist) {
            console.error(`\x1b[31mCan not inject styles, file \x1b[0m\x1b[32m\x1b[41m'${filename}'\x1b[0m \x1b[31min not found\x1b[0m`);
            console.error(`\x1b[31mError in \x1b[33m'${path.relative(process.cwd(), file.path)}'\x1b[0m`);
            return '';
        }
        const style = fs.readFileSync(file_path, 'utf8');

        return '<style>\n' + style + '\n</style>';
    }
}

function injectScriptsText(scriptPath = '', htmlFile, wpOptions) {
    let exist = fs.existsSync(scriptPath);
    if (!exist) {
        console.error(`\x1b[31mCan not inject script, file \x1b[0m\x1b[32m\x1b[41m'${scriptPath}'\x1b[0m \x1b[31min not found\x1b[0m`);
        return Promise.resolve();
    }

    const script = fs.readFileSync(scriptPath, 'utf8');
    const hasImports = !!script.match(JS_IMPORTS_REG);
    if (!hasImports) {
        replaceScripts(htmlFile, '<script>\n' + script + '\n</script>');
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        gulp.src(scriptPath)
            .pipe(plumber({
                errorHandler: notify.onError(err => ({
                    title: 'Webpack',
                    message: err.message
                }))
            }))
            .pipe(named())
            .pipe(webpackStream(Object.assign({}, wpOptions)))
            .pipe(through2(
                function (file, enc, callback) {
                    replaceScripts(htmlFile, '<script>\n' + String(file.contents) + '\n</script>');
                    callback(null, file)
                }))
            .on('data', () => resolve());
    })
}

function replaceScripts(file, script) {
    file.contents = Buffer.from(String(file.contents)
        .replace(SCRIPTS_REG, script));
}

function injectImports(file, paths) {
    return function (s, filenames) {
        return filenames
            .split(/\s*,\s*/)
            .map(function (name) {
                return name.replace(/['\s]/g, '')
            })
            .map(function (name) {
                if (!name) return '';

                let href;

                if (paths[name]) {
                    href = path.relative(file.dirname, paths[name]);
                } else {
                    const component_name = name.indexOf('/') >= 0 ? `${name}.html` : `${name}/${name}.html`;
                    paths._custom_paths.forEach(function (component_base) {
                        let component_path = getComponentPath(component_base, component_name);
                        if (component_path) href = path.relative(file.dirname, component_path);
                    });
                }

                if (!href) {
                    console.error(`\x1b[31mCan not import nonexistent element\x1b[0m \x1b[32m\x1b[41m'${name}'\x1b[0m \x1b[31min ${file.stem}\x1b[0m`);
                    console.error(`\x1b[31mError in \x1b[33m'${path.relative(process.cwd(), file.path)}'\x1b[0m`);
                    return '';
                }

                return '<link rel="import" href="' + href + '">'
            })
            .join('\n');
    }
}

function getComponentPath(component_base, component_name) {
    if (_.isString(component_base)) {
        let component_path = path.normalize(`${component_base}/${component_name}`);
        let exist = fs.existsSync(component_path);
        return exist ? component_path : null;
    } else if (_.isObject(component_base) && !_.isArray(component_base) &&
                component_base.path && component_base.new_base) {
        let current_path = path.normalize(`${component_base.path}/${component_name}`);
        let exist = fs.existsSync(current_path);
        return exist ? path.normalize(`${component_base.new_base}/${component_name}`) : null;
    }
}

function getImports(imports_list, element_name) {
    let list = [];
    (imports_list[element_name] || []).forEach((element_import) => {
        list.push(element_import);
        getImports(imports_list, element_import).forEach((i) => {
            if (list.indexOf(i) < 0) list.push(i);
        })

    });
    return list;
}

module.exports = Builder;