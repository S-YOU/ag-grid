import {Utils as _} from '../utils';
import {Logger} from "../logger";
import {LoggerFactory} from "../logger";

// steps in booting up:
// 1. create all beans
// 2. autowire all attributes
// 3. wire all beans
// 4. initialise the model
// 5. initialise the view
// 6. boot??? (not sure if this is needed)
// each bean is responsible for initialising itself, taking items from the gridOptionsWrapper

export interface ContextParams {
    seed: any,
    beans: any[],
    overrideBeans: any[],
    debug: boolean
}

interface BeanEntry {
    bean: any,
    beanInstance: any,
    beanName: any
}

export class Context {

    private beans: {[key: string]: BeanEntry} = {};
    private contextParams: ContextParams;
    private logger: Logger;

    private destroyed = false;

    public constructor(params: ContextParams) {

        if (!params || !params.beans) {
            return;
        }

        this.contextParams = params;

        this.logger = new Logger('Context', this.contextParams.debug);
        this.logger.log('>> creating ag-Application Context');

        this.createBeans();

        var beans = _.mapObject(this.beans, (beanEntry: BeanEntry) => beanEntry.beanInstance);

        this.wireBeans(beans);

        this.logger.log('>> ag-Application Context ready - component is alive');
    }

    public wireBean(bean: any): void {
        this.wireBeans([bean]);
    }

    private wireBeans(beans: any[]): void {
        this.autoWireBeans(beans);
        this.methodWireBeans(beans);
        this.postWire(beans);
        this.wireCompleteBeans(beans);
    }

    private createBeans(): void {

        // register all normal beans
        this.contextParams.beans.forEach(this.createBeanEntry.bind(this));
        // register override beans, these will overwrite beans above of same name
        if (this.contextParams.overrideBeans) {
            this.contextParams.overrideBeans.forEach(this.createBeanEntry.bind(this));
        }

        // instantiate all beans - overridden beans will be left out
        _.iterateObject(this.beans, (key: string, beanEntry: BeanEntry) => {
            var constructorParamsMeta: any;
            if (beanEntry.bean.prototype.__agBeanMetaData
                && beanEntry.bean.prototype.__agBeanMetaData.agConstructor) {
                constructorParamsMeta = beanEntry.bean.prototype.__agBeanMetaData.agConstructor;
            }
            var constructorParams = this.getBeansForParameters(constructorParamsMeta, beanEntry.beanName);
            var newInstance = applyToConstructor(beanEntry.bean, constructorParams);
            beanEntry.beanInstance = newInstance;

            this.logger.log('bean ' + this.getBeanName(newInstance) + ' created');
        });
    }

    private createBeanEntry(Bean: new()=>Object): void {

        var metaData = Bean.prototype.__agBeanMetaData;

        if (!metaData) {
            var beanName: string;
            if (Bean.prototype.constructor) {
                beanName = Bean.prototype.constructor.name;
            } else {
                beanName = ''+Bean;
            }
            console.error('context item ' + beanName + ' is not a bean');
            return;
        }

        var beanEntry = {
            bean: Bean,
            beanInstance: <any> null,
            beanName: metaData.beanName
        };

        this.beans[metaData.beanName] = beanEntry;
    }

    private autoWireBeans(beans: any[]): void {
        beans.forEach( bean => this.autoWireBean(bean) );
    }

    private methodWireBeans(beans: any[]): void {
        beans.forEach( bean => this.methodWireBean(bean) );
    }

    private autoWireBean(bean: any): void {
        if (!bean
            || !bean.__agBeanMetaData
            || !bean.__agBeanMetaData.agClassAttributes) {
            return;
        }
        var attributes = bean.__agBeanMetaData.agClassAttributes;
        if (!attributes) {
            return;
        }

        var beanName = this.getBeanName(bean);

        attributes.forEach( (attribute: any)=> {
            var otherBean = this.lookupBeanInstance(beanName, attribute.beanName, attribute.optional);
            bean[attribute.attributeName] = otherBean;
        });
    }

    private getBeanName(bean: any): string {
        var constructorString = bean.constructor.toString();
        var beanName = constructorString.substring(9, constructorString.indexOf('('));
        return beanName;
    }

    private methodWireBean(bean: any): void {
        var beanName = this.getBeanName(bean);

        // if no init method, skip he bean
        if (!bean.agWire) {
            return;
        }

        var wireParams: any;
        if (bean.__agBeanMetaData
            && bean.__agBeanMetaData.agWire) {
            wireParams = bean.__agBeanMetaData.agWire;
        }

        var initParams = this.getBeansForParameters(wireParams, beanName);

        bean.agWire.apply(bean, initParams);
    }

    private getBeansForParameters(parameters: any, beanName: string): any[] {
        var beansList: any[] = [];
        if (parameters) {
            _.iterateObject(parameters, (paramIndex: string, otherBeanName: string) => {
                var otherBean = this.lookupBeanInstance(beanName, otherBeanName);
                beansList[Number(paramIndex)] = otherBean;
            });
        }
        return beansList;
    }

    private lookupBeanInstance(wiringBean: string, beanName: string, optional = false): any {
        if (beanName === 'context') {
            return this;
        } else if (this.contextParams.seed && this.contextParams.seed.hasOwnProperty(beanName)) {
            return this.contextParams.seed[beanName];
        } else {
            var beanEntry = this.beans[beanName];
            if (beanEntry) {
                return beanEntry.beanInstance;
            }
            if (!optional) {
                console.error('ag-Grid: unable to find bean reference ' + beanName + ' while initialising ' + wiringBean);
            }
            return null;
        }
    }

    private postWire(beans: any): void {
        beans.forEach( (bean: any) => {
            // try calling init methods
            if (bean.__agBeanMetaData && bean.__agBeanMetaData.postConstructMethods) {
                bean.__agBeanMetaData.postConstructMethods.forEach( (methodName: string) => bean[methodName]() );
            }

        } );
    }

    private wireCompleteBeans(beans: any[]): void {
        beans.forEach( (bean)=> {
            if (bean.agApplicationBoot) {
                bean.agApplicationBoot();
            }
        } );
    }

    public destroy(): void {
        // should only be able to destroy once
        if (this.destroyed) {
            return;
        }
        this.logger.log('>> Shutting down ag-Application Context');
        _.iterateObject(this.beans, (key: string, beanEntry: BeanEntry) => {
            if (beanEntry.beanInstance.agDestroy) {
                if (this.contextParams.debug) {
                    console.log('ag-Grid: destroying ' + beanEntry.beanName);
                }
                beanEntry.beanInstance.agDestroy();
            }
            this.logger.log('bean ' + this.getBeanName(beanEntry.beanInstance) + ' destroyed');
        });
        this.destroyed = true;
        this.logger.log('>> ag-Application Context shut down - component is dead');
    }
}

// taken from: http://stackoverflow.com/questions/3362471/how-can-i-call-a-javascript-constructor-using-call-or-apply
// allows calling 'apply' on a constructor
function applyToConstructor(constructor: Function, argArray: any[]) {
    var args = [null].concat(argArray);
    var factoryFunction = constructor.bind.apply(constructor, args);
    return new factoryFunction();
}

export function PostConstruct(target: Object, methodName: string, descriptor: TypedPropertyDescriptor<any>): void {
    // it's an attribute on the class
    var props = getOrCreateProps(target);
    if (!props.postConstructMethods) {
        props.postConstructMethods = [];
    }
    props.postConstructMethods.push(methodName);
}

export function Bean(beanName: string): Function {
    return (classConstructor: any) => {
        var props = getOrCreateProps(classConstructor.prototype);
        props.beanName = beanName;
    };
}

export function Autowired(name?: string): Function {
    return autowiredFunc.bind(this, name, false);
}

export function Optional(name?: string): Function {
    return autowiredFunc.bind(this, name, true);
}

function autowiredFunc(name: string, optional: boolean, classPrototype: any, methodOrAttributeName: string, index: number) {

    if (name===null) {
        console.error('ag-Grid: Autowired name should not be null');
        return;
    }
    if (typeof index === 'number') {
        console.error('ag-Grid: Autowired should be on an attribute');
        return;
    }

    // it's an attribute on the class
    var props = getOrCreateProps(classPrototype);
    if (!props.agClassAttributes) {
        props.agClassAttributes = [];
    }
    props.agClassAttributes.push({
        attributeName: methodOrAttributeName,
        beanName: name,
        optional: optional
    });
}

export function Qualifier(name: string): Function {
    return (classPrototype: any, methodOrAttributeName: string, index: number) => {

        var props: any;

        if (typeof index === 'number') {
            // it's a parameter on a method
            var methodName: string;
            if (methodOrAttributeName) {
                props = getOrCreateProps(classPrototype);
                methodName = methodOrAttributeName;
            } else {
                props = getOrCreateProps(classPrototype.prototype);
                methodName = 'agConstructor';
            }
            if (!props[methodName]) {
                props[methodName] = {};
            }
            props[methodName][index] = name;
        }

    };
}

function getOrCreateProps(target: any): any {

    var props = target.__agBeanMetaData;

    if (!props) {
        props = {};
        target.__agBeanMetaData = props;
    }

    return props;
}