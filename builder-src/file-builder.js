'use strict';

var through2 = require('through2').obj,
    path = require('path'),
    fs = require('fs');

const STYLES_REG = /<!--\s*inject\s+styles\s+'\s*(.*\.scss|.*\.css|.*\.less|.*\.sass)\s*'\s*-->/g,
    SCRIPTS_REG = /<!--\s*inject\s+scripts\s+'(.*\.js)\s*'\s*-->/g,
    IMPORTS_REG = /<!--\s*import\s*\[([\s\S]*?)]\s*-->/g;


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
                if (file.stem !== imports_obj.shell && imports_obj.fragments.indexOf(file.stem) < 0) file.contents = new Buffer(String(file.contents)
                    .replace(IMPORTS_REG, ''));
                else if (file.stem === imports_obj.shell) {
                    file.contents = new Buffer(String(file.contents).replace(IMPORTS_REG, shell_imports));
                } else {
                    file.contents = new Buffer(String(file.contents).replace(IMPORTS_REG, fragments[file.stem]));
                }
            }
        });
        }

        this._files.forEach((file) => {
            if (file.isBuffer()) {
            file.contents = new Buffer(String(file.contents)
                .replace(STYLES_REG, injectStyles(file))
                .replace(IMPORTS_REG, injectImports(file, this._paths))
                .replace(SCRIPTS_REG, injectScripts(file)));
        }
    })
    }

    _clean(stream) {
        this._files.forEach((file) => {
            stream.push(file);
    });
        this._files = [];
    }

    start(custom_paths, reduce_imports) {
        this._paths._custom_paths = custom_paths || [];
        let builder = this;

        return through2(
            function (file, enc, callback) {
                builder._register(file, reduce_imports);
                callback()
            },
            function (callback) {
                builder._inject(reduce_imports);
                builder._clean(this);
                callback()
            }
        )
    }
}

function injectStyles(file) {
    return function (s, filename) {
        var file_path = path.resolve(file.dirname, filename);
        var style = fs.readFileSync(file_path, 'utf8');

        return '<style>\n' + style + '\n</style>';
    }
}

function injectScripts(file) {
    return function (s, filename) {
        var file_path = path.resolve(file.dirname, filename);
        var script = fs.readFileSync(file_path, 'utf8');

        return '<script>\n' + script + '\n</script>';
    }
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

                var href;

                if (paths[name]) {
                    href = path.relative(file.dirname, paths[name]);
                } else {
                    var component_name = name.indexOf('/') >= 0 ? `${name}.html` : `${name}/${name}.html`;
                    paths._custom_paths.forEach(function (component_base) {
                        let component_path = path.normalize(`${component_base}/${component_name}`);
                        let exist = fs.existsSync(path.normalize(`${component_base}/${component_name}`));
                        if (exist) href = path.relative(file.dirname, component_path);
                    });
                }

                if (!href) throw new Error(`Can not import nonexistent element '${name}'`);

                return '<link rel="import" href="' + href + '">'
            })
            .join('\n');
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


function wasModified(file, manifest) {
    let mtime = file.stats.mtime,
        last_mtime = manifest[file.relative];

    if (!last_mtime || (last_mtime.getTime() !== mtime.getTime())) {
        manifest[file.relative] = mtime;
        return true;
    }
}


module.exports = Builder;