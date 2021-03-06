import {GridOptionsWrapper} from "./gridOptionsWrapper";
import {Column} from "./entities/column";
import {RowNode} from "./entities/rowNode";
var FUNCTION_STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var FUNCTION_ARGUMENT_NAMES = /([^\s,]+)/g;

export class Utils {

    // taken from:
    // http://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser
    // both of these variables are lazy loaded, as otherwise they try and get initialised when we are loading
    // unit tests and we don't have references to window or document in the unit tests
    private static isSafari: boolean;
    private static isIE: boolean;

    static iterateObject(object: any, callback: (key:string, value: any) => void) {
        var keys = Object.keys(object);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = object[key];
            callback(key, value);
        }
    }

    static cloneObject(object: any): any {
        var copy = <any>{};
        var keys = Object.keys(object);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = object[key];
            copy[key] = value;
        }
        return copy;
    }

    static map<TItem, TResult>(array: TItem[], callback: (item: TItem) => TResult) {
        var result: TResult[] = [];
        for (var i = 0; i < array.length; i++) {
            var item = array[i];
            var mappedItem = callback(item);
            result.push(mappedItem);
        }
        return result;
    }

    static mapObject<TResult>(object: any, callback: (item: any) => TResult) {
        var result: TResult[] = [];
        Utils.iterateObject(object, (key: string, value: any)=> {
            result.push(callback(value));
        });
        return result;
    }

    static forEach<T>(array: T[], callback: (item: T, index: number) => void) {
        if (!array) {
            return;
        }

        for (var i = 0; i < array.length; i++) {
            var value = array[i];
            callback(value, i);
        }
    }

    static filter<T>(array: T[], callback: (item: T) => boolean): T[] {
        var result: T[] = [];
        array.forEach(function(item: T) {
            if (callback(item)) {
                result.push(item);
            }
        });
        return result;
    }

    static assign(object: any, source: any): void {
        Utils.iterateObject(source, function(key: string, value: any) {
            object[key] = value;
        });
    }

    static getFunctionParameters(func: any) {
        var fnStr = func.toString().replace(FUNCTION_STRIP_COMMENTS, '');
        var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(FUNCTION_ARGUMENT_NAMES);
        if (result === null) {
            return [];
        } else {
            return result;
        }
    }

    static find<T>(collection: T[], predicate: string |((item: T) => void), value?: any): T {
        if (collection === null || collection === undefined) {
            return null;
        }
        var firstMatchingItem: T;
        for (var i = 0; i < collection.length; i++) {
            var item: T = collection[i];
            if (typeof predicate === 'string') {
                if ((<any>item)[predicate] === value) {
                    firstMatchingItem = item;
                    break;
                }
            } else {
                var callback = <(item: T) => void> predicate;
                if (callback(item)) {
                    firstMatchingItem = item;
                    break;
                }
            }
        }
        return firstMatchingItem;
    }

    static toStrings<T>(array: T[]): string[] {
        return this.map(array, function (item) {
            if (item === undefined || item === null || !item.toString) {
                return null;
            } else {
                return item.toString();
            }
        });
    }

    static iterateArray<T>(array: T[], callback: (item: T, index: number) => void) {
        for (var index = 0; index < array.length; index++) {
            var value = array[index];
            callback(value, index);
        }
    }

    //Returns true if it is a DOM node
    //taken from: http://stackoverflow.com/questions/384286/javascript-isdom-how-do-you-check-if-a-javascript-object-is-a-dom-object
    static isNode(o: any) {
        return (
            typeof Node === "function" ? o instanceof Node :
            o && typeof o === "object" && typeof o.nodeType === "number" && typeof o.nodeName === "string"
        );
    }

    //Returns true if it is a DOM element
    //taken from: http://stackoverflow.com/questions/384286/javascript-isdom-how-do-you-check-if-a-javascript-object-is-a-dom-object
    static isElement(o: any) {
        return (
            typeof HTMLElement === "function" ? o instanceof HTMLElement : //DOM2
            o && typeof o === "object" && o !== null && o.nodeType === 1 && typeof o.nodeName === "string"
        );
    }

    static isNodeOrElement(o: any) {
        return this.isNode(o) || this.isElement(o);
    }

    //adds all type of change listeners to an element, intended to be a text field
    static addChangeListener(element: HTMLElement, listener: EventListener) {
        element.addEventListener("changed", listener);
        element.addEventListener("paste", listener);
        element.addEventListener("input", listener);
        // IE doesn't fire changed for special keys (eg delete, backspace), so need to
        // listen for this further ones
        element.addEventListener("keydown", listener);
        element.addEventListener("keyup", listener);
    }

    //if value is undefined, null or blank, returns null, otherwise returns the value
    static makeNull(value: any) {
        if (value === null || value === undefined || value === "") {
            return null;
        } else {
            return value;
        }
    }

    static missing(value: any): boolean {
        return !this.exists(value);
    }

    static missingOrEmpty(value: any[]|string): boolean {
        return this.missing(value) || value.length === 0;
    }

    static exists(value: any): boolean {
        if (value===null || value===undefined || value==='') {
            return false;
        } else {
            return true;
        }
    }

    static existsAndNotEmpty(value: any[]): boolean {
        return this.exists(value) && value.length > 0;
    }

    static removeAllChildren(node: HTMLElement) {
        if (node) {
            while (node.hasChildNodes()) {
                node.removeChild(node.lastChild);
            }
        }
    }

    static removeElement(parent: HTMLElement, cssSelector: string) {
        this.removeFromParent(parent.querySelector(cssSelector));
    }

    static removeFromParent(node: Element) {
        if (node && node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }

    static isVisible(element: HTMLElement) {
        return (element.offsetParent !== null);
    }

    /**
     * loads the template and returns it as an element. makes up for no simple way in
     * the dom api to load html directly, eg we cannot do this: document.createElement(template)
     */
    static loadTemplate(template: string): HTMLElement {
        var tempDiv = document.createElement("div");
        tempDiv.innerHTML = template;
        return <HTMLElement> tempDiv.firstChild;
    }

    static addOrRemoveCssClass(element: HTMLElement, className: string, addOrRemove: boolean) {
        if (addOrRemove) {
            this.addCssClass(element, className);
        } else {
            this.removeCssClass(element, className);
        }
    }

    static callIfPresent(func: Function): void {
        if (func) {
            func();
        }
    }

    static addCssClass(element: HTMLElement, className: string) {
        if (!className || className.length===0) { return; }
        if (className.indexOf(' ') >= 0) {
            className.split(' ').forEach( value => this.addCssClass(element, value));
            return;
        }
        if (element.classList) {
            element.classList.add(className);
        } else {
            if (element.className && element.className.length > 0) {
                var cssClasses = element.className.split(' ');
                if (cssClasses.indexOf(className) < 0) {
                    cssClasses.push(className);
                    element.className = cssClasses.join(' ');
                }
            } else {
                element.className = className;
            }
        }
    }

    static offsetHeight(element: HTMLElement) {
        return element && element.clientHeight ? element.clientHeight : 0;
    }

    static offsetWidth(element: HTMLElement) {
        return element && element.clientWidth ? element.clientWidth : 0;
    }

    static removeCssClass(element: HTMLElement, className: string) {
        if (element.className && element.className.length > 0) {
            var cssClasses = element.className.split(' ');
            var index = cssClasses.indexOf(className);
            if (index >= 0) {
                cssClasses.splice(index, 1);
                element.className = cssClasses.join(' ');
            }
        }
    }

    static removeFromArray<T>(array: T[], object: T) {
        if (array.indexOf(object) >= 0) {
            array.splice(array.indexOf(object), 1);
        }

    }

    static defaultComparator(valueA: any, valueB: any): number {
        var valueAMissing = valueA === null || valueA === undefined;
        var valueBMissing = valueB === null || valueB === undefined;
        if (valueAMissing && valueBMissing) {
            return 0;
        }
        if (valueAMissing) {
            return -1;
        }
        if (valueBMissing) {
            return 1;
        }

        if (valueA < valueB) {
            return -1;
        } else if (valueA > valueB) {
            return 1;
        } else {
            return 0;
        }
    }

    static formatWidth(width: number | string) {
        if (typeof width === "number") {
            return width + "px";
        } else {
            return width;
        }
    }

    /**
     * Tries to use the provided renderer.
     */
    static useRenderer<TParams>(eParent: Element, eRenderer: (params:TParams) => Node | string, params: TParams) {
        var resultFromRenderer = eRenderer(params);
        //TypeScript type inference magic
        if (typeof resultFromRenderer === 'string') {
            var eTextSpan = document.createElement('span');
            eTextSpan.innerHTML = resultFromRenderer;
            eParent.appendChild(eTextSpan);
        } else if (this.isNodeOrElement(resultFromRenderer)) {
            //a dom node or element was returned, so add child
            eParent.appendChild(<Node>resultFromRenderer);
        } else {
            if (this.exists(resultFromRenderer)) {
                console.warn('ag-Grid: result from render should be either a string or a DOM object, got ' + typeof resultFromRenderer);
            }
        }
    }

    /**
     * If icon provided, use this (either a string, or a function callback).
     * if not, then use the second parameter, which is the svgFactory function
     */
    static createIcon(iconName: string, gridOptionsWrapper: GridOptionsWrapper, column: Column, svgFactoryFunc: () => Node) {
        var eResult = document.createElement('span');
        eResult.appendChild(this.createIconNoSpan(iconName, gridOptionsWrapper, column, svgFactoryFunc));
        return eResult;
    }

    static createIconNoSpan(iconName: string, gridOptionsWrapper: GridOptionsWrapper, colDefWrapper: Column, svgFactoryFunc: () => Node) {
        var userProvidedIcon: Function | string;
        // check col for icon first
        if (colDefWrapper && colDefWrapper.getColDef().icons) {
            userProvidedIcon = colDefWrapper.getColDef().icons[iconName];
        }
        // it not in col, try grid options
        if (!userProvidedIcon && gridOptionsWrapper.getIcons()) {
            userProvidedIcon = gridOptionsWrapper.getIcons()[iconName];
        }
        // now if user provided, use it
        if (userProvidedIcon) {
            var rendererResult: any;
            if (typeof userProvidedIcon === 'function') {
                rendererResult = userProvidedIcon();
            } else if (typeof userProvidedIcon === 'string') {
                rendererResult = userProvidedIcon;
            } else {
                throw 'icon from grid options needs to be a string or a function';
            }
            if (typeof rendererResult === 'string') {
                return this.loadTemplate(rendererResult);
            } else if (this.isNodeOrElement(rendererResult)) {
                return rendererResult;
            } else {
                throw 'iconRenderer should return back a string or a dom object';
            }
        } else {
            // otherwise we use the built in icon
            return svgFactoryFunc();
        }
    }

    static addStylesToElement(eElement: any, styles: any) {
        if (!styles) { return; }
        Object.keys(styles).forEach(function (key) {
            eElement.style[key] = styles[key];
        });
    }

    static getScrollbarWidth() {
        var outer = document.createElement("div");
        outer.style.visibility = "hidden";
        outer.style.width = "100px";
        outer.style.msOverflowStyle = "scrollbar"; // needed for WinJS apps

        document.body.appendChild(outer);

        var widthNoScroll = outer.offsetWidth;
        // force scrollbars
        outer.style.overflow = "scroll";

        // add innerdiv
        var inner = document.createElement("div");
        inner.style.width = "100%";
        outer.appendChild(inner);

        var widthWithScroll = inner.offsetWidth;

        // remove divs
        outer.parentNode.removeChild(outer);

        return widthNoScroll - widthWithScroll;
    }

    static isKeyPressed(event: KeyboardEvent, keyToCheck: number) {
        var pressedKey = event.which || event.keyCode;
        return pressedKey === keyToCheck;
    }

    static setVisible(element: HTMLElement, visible: boolean, visibleStyle?: string) {
        if (visible) {
            if (this.exists(visibleStyle)) {
                element.style.display = visibleStyle;
            } else {
                element.style.display = 'inline';
            }
        } else {
            element.style.display = 'none';
        }
    }

    static isBrowserIE(): boolean {
        if (this.isIE===undefined) {
            this.isIE = /*@cc_on!@*/false || !!(<any>document).documentMode; // At least IE6
        }
        return this.isIE;
    }

    static isBrowserSafari(): boolean {
        if (this.isSafari===undefined) {
            this.isSafari = Object.prototype.toString.call((<any>window).HTMLElement).indexOf('Constructor') > 0;
        }
        return this.isSafari;
    }

    // taken from: http://stackoverflow.com/questions/1038727/how-to-get-browser-width-using-javascript-code
    static getBrowserWidth(): number {
        if (window.innerHeight) {
            return window.innerWidth;
        }

        if (document.documentElement && document.documentElement.clientWidth) {
            return document.documentElement.clientWidth;
        }

        if (document.body) {
            return document.body.clientWidth;
        }

        return -1;
    }

    // taken from: http://stackoverflow.com/questions/1038727/how-to-get-browser-width-using-javascript-code
    static getBrowserHeight(): number {
        if (window.innerHeight) {
            return window.innerHeight;
        }

        if (document.documentElement && document.documentElement.clientHeight) {
            return document.documentElement.clientHeight;
        }

        if (document.body) {
            return document.body.clientHeight;
        }

        return -1;
    }

    static setCheckboxState(eCheckbox: any, state: any) {
        if (typeof state === 'boolean') {
            eCheckbox.checked = state;
            eCheckbox.indeterminate = false;
        } else {
            // isNodeSelected returns back undefined if it's a group and the children
            // are a mix of selected and unselected
            eCheckbox.indeterminate = true;
        }
    }

}

