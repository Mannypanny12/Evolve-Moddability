function ownDescriptor(target, field){
    return Object.getOwnPropertyDescriptor(target, field);
}

function isObservedResourceRecord(record){
    const marker = ownDescriptor(record, '__ob__');
    if (
        !marker ||
        !Object.prototype.hasOwnProperty.call(marker, 'value') ||
        marker.enumerable !== false ||
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
        !valueDescriptor ||
        !Object.prototype.hasOwnProperty.call(valueDescriptor, 'value') ||
        valueDescriptor.value !== record ||
        !depDescriptor ||
        !Object.prototype.hasOwnProperty.call(depDescriptor, 'value') ||
        depDescriptor.value === null ||
        typeof depDescriptor.value !== 'object' ||
        !vmCountDescriptor ||
        !Object.prototype.hasOwnProperty.call(vmCountDescriptor, 'value') ||
        !Number.isSafeInteger(vmCountDescriptor.value) ||
        vmCountDescriptor.value < 0
    ){
        return false;
    }

    const depIdDescriptor = ownDescriptor(depDescriptor.value, 'id');
    return Boolean(
        depIdDescriptor &&
        Object.prototype.hasOwnProperty.call(depIdDescriptor, 'value') &&
        Number.isSafeInteger(depIdDescriptor.value) &&
        depIdDescriptor.value >= 0
    );
}

export function readReviewedReactiveResourceField(record, field){
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
