'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var through2 = require('through2').obj,
    path = require('path'),
    fs = require('fs');

var STYLES_REG = /<!--\s*inject\s+styles\s+'\s*(.*\.scss|.*\.css|.*\.less|.*\.sass)\s*'\s*-->/g,
    SCRIPTS_REG = /<!--\s*inject\s+scripts\s+'(.*\.js)\s*'\s*-->/g,
    IMPORTS_REG = /<!--\s*import\s*\[([\s\S]*?)]\s*-->/g;

var Builder = function () {
    function Builder() {
        _classCallCheck(this, Builder);

        this._paths = {};
        this._files = [];
        this._imports = {};
    }

    _createClass(Builder, [{
        key: '_register',
        value: function _register(file, imports_obj) {
            var _this = this;

            this._paths[file.stem] = file.path;
            this._files.push(file);
            if (imports_obj && file.isBuffer()) {
                (function () {
                    var imports = [];

                    var result = void 0;
                    while (result = IMPORTS_REG.exec(file.contents)) {
                        result[1].split(/\s*,\s*/).map(function (name) {
                            return name.replace(/['\s]/g, '');
                        }).forEach(function (element) {
                            imports.push(element);
                        });
                    }

                    _this._imports[file.stem] = imports;
                })();
            }
        }
    }, {
        key: '_inject',
        value: function _inject(imports_obj) {
            var _this2 = this;

            if (imports_obj) {
                (function () {
                    var shell_imports = getImports(_this2._imports, imports_obj.shell),
                        fragments = {};

                    imports_obj.fragments.forEach(function (name) {
                        var imports = [];
                        getImports(_this2._imports, name).forEach(function (_import) {
                            if (shell_imports.indexOf(_import) < 0) imports.push(_import);
                        });
                        fragments[name] = '<!-- import [' + imports.join(', ') + ']-->';
                    });
                    shell_imports = '<!-- import [' + shell_imports.join(', ') + ']-->';

                    _this2._files.forEach(function (file) {
                        if (file.isBuffer()) {
                            if (file.stem !== imports_obj.shell && imports_obj.fragments.indexOf(file.stem) < 0) file.contents = new Buffer(String(file.contents).replace(IMPORTS_REG, ''));else if (file.stem === imports_obj.shell) {
                                file.contents = new Buffer(String(file.contents).replace(IMPORTS_REG, shell_imports));
                            } else {
                                file.contents = new Buffer(String(file.contents).replace(IMPORTS_REG, fragments[file.stem]));
                            }
                        }
                    });
                })();
            }

            this._files.forEach(function (file) {
                if (file.isBuffer()) {
                    file.contents = new Buffer(String(file.contents).replace(STYLES_REG, injectStyles(file)).replace(IMPORTS_REG, injectImports(file, _this2._paths)).replace(SCRIPTS_REG, injectScripts(file)));
                }
            });
        }
    }, {
        key: '_clean',
        value: function _clean(stream) {
            this._files.forEach(function (file) {
                stream.push(file);
            });
            this._files = [];
        }
    }, {
        key: 'start',
        value: function start(custom_paths, reduce_imports) {
            this._paths._custom_paths = custom_paths || [];
            var builder = this;

            return through2(function (file, enc, callback) {
                builder._register(file, reduce_imports);
                callback();
            }, function (callback) {
                builder._inject(reduce_imports);
                builder._clean(this);
                callback();
            });
        }
    }]);

    return Builder;
}();

function injectStyles(file) {
    return function (s, filename) {
        var file_path = path.resolve(file.dirname, filename);
        var exist = fs.existsSync(file_path);
        if (!exist) {
            console.error('\x1B[31mCan not inject styles, file \x1B[0m \x1B[32m\x1B[41m\'' + filename + '\'\x1B[0m \x1B[31min not found\x1B[0m');
            console.error('\x1B[31mError in \x1B[33m\'' + path.relative(process.cwd(), file.path) + '\'\x1B[0m');
            return '';
        }
        var style = fs.readFileSync(file_path, 'utf8');

        return '<style>\n' + style + '\n</style>';
    };
}

function injectScripts(file) {
    return function (s, filename) {
        var file_path = path.resolve(file.dirname, filename);
        var exist = fs.existsSync(file_path);
        if (!exist) {
            console.error('\x1B[31mCan not inject styles, file \x1B[0m \x1B[32m\x1B[41m\'' + filename + '\'\x1B[0m \x1B[31min not found\x1B[0m');
            console.error('\x1B[31mError in \x1B[33m\'' + path.relative(process.cwd(), file.path) + '\'\x1B[0m');
            return '';
        }
        var script = fs.readFileSync(file_path, 'utf8');

        return '<script>\n' + script + '\n</script>';
    };
}

function injectImports(file, paths) {
    return function (s, filenames) {
        return filenames.split(/\s*,\s*/).map(function (name) {
            return name.replace(/['\s]/g, '');
        }).map(function (name) {
            if (!name) return '';

            var href;

            if (paths[name]) {
                href = path.relative(file.dirname, paths[name]);
            } else {
                var component_name = name.indexOf('/') >= 0 ? name + '.html' : name + '/' + name + '.html';
                paths._custom_paths.forEach(function (component_base) {
                    var component_path = path.normalize(component_base + '/' + component_name);
                    var exist = fs.existsSync(path.normalize(component_base + '/' + component_name));
                    if (exist) href = path.relative(file.dirname, component_path);
                });
            }

            if (!href) {
                console.error('\x1B[31mCan not import nonexistent element\x1B[0m \x1B[32m\x1B[41m \'' + name + '\'\x1B[0m \x1B[31min ' + file.stem + '\x1B[0m');
                console.error('\x1B[31mError in \x1B[33m\'' + path.relative(process.cwd(), file.path) + '\'\x1B[0m');
                return '';
            }

            return '<link rel="import" href="' + href + '">';
        }).join('\n');
    };
}

function getImports(imports_list, element_name) {
    var list = [];
    (imports_list[element_name] || []).forEach(function (element_import) {
        list.push(element_import);
        getImports(imports_list, element_import).forEach(function (i) {
            if (list.indexOf(i) < 0) list.push(i);
        });
    });
    return list;
}

function wasModified(file, manifest) {
    var mtime = file.stats.mtime,
        last_mtime = manifest[file.relative];

    if (!last_mtime || last_mtime.getTime() !== mtime.getTime()) {
        manifest[file.relative] = mtime;
        return true;
    }
}

module.exports = Builder;