const REVIEWED_RESOURCE_FIELDS = new Set(['amount', 'max', 'display']);

function ownDescriptor(target, field){
    return Object.getOwnPropertyDescriptor(target, field);
}

function isWritableEnumerableDataField(descriptor){
    return Boolean(
        descriptor &&
        Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
        descriptor.writable === true &&
        descriptor.enumerable === true &&
        descriptor.configurable === true
    );
}

function isObservedResourceRecord(record){
    const marker = ownDescriptor(record, '__ob__');
    if (
        !marker ||
        !Object.prototype.hasOwnProperty.call(marker, 'value') ||
        marker.writable !== true ||
        marker.enumerable !== false ||
        marker.configurable !== true ||
        marker.value === null ||
        typeof marker.value !== 'object'
    ){
        return false;
    }

    const observer = marker.value;
    const valueDescriptor = ownDescriptor(observer, 'value');
    const depDescriptor = ownDescriptor(observer, 'dep');
    const vmCountDescriptor = ownDescriptor(observer, 'vmCount');
    if (
        !isWritableEnumerableDataField(valueDescriptor) ||
        valueDescriptor.value !== record ||
        !isWritableEnumerableDataField(depDescriptor) ||
        depDescriptor.value === null ||
        typeof depDescriptor.value !== 'object' ||
        !isWritableEnumerableDataField(vmCountDescriptor) ||
        !Number.isSafeInteger(vmCountDescriptor.value) ||
        vmCountDescriptor.value < 0
    ){
        return false;
    }

    const depIdDescriptor = ownDescriptor(depDescriptor.value, 'id');
    return Boolean(
        isWritableEnumerableDataField(depIdDescriptor) &&
        Number.isSafeInteger(depIdDescriptor.value) &&
        depIdDescriptor.value >= 0
    );
}

export function readReviewedReactiveResourceField(record, field){
    if (!REVIEWED_RESOURCE_FIELDS.has(field)) return null;

    const descriptor = ownDescriptor(record, field);
    if (!descriptor || Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    if (!isObservedResourceRecord(record)) return null;
    if (
        descriptor.enumerable !== true ||
        descriptor.configurable !== true ||
        typeof descriptor.get !== 'function' ||
        descriptor.get.length !== 0 ||
        typeof descriptor.set !== 'function' ||
        descriptor.set.length !== 1
    ){
        return null;
    }

    const value = Reflect.apply(descriptor.get, record, []);
    return Object.freeze({
        value,
        writable: true,
    });
}
