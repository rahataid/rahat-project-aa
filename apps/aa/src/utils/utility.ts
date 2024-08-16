export const lowerCaseObjectKeys = (obj: any) => {
    if (typeof obj !== 'object' || obj === null) {
        // Return the value if it's not an object
        return obj;
    }

    if (Array.isArray(obj)) {
        // Process each element in the array
        return obj.map(lowerCaseObjectKeys);
    }

    // Process each key-value pair in the object
    const lowerCaseObj: any = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            lowerCaseObj[key.toLowerCase()] = lowerCaseObjectKeys(obj[key]);
        }
    }
    return lowerCaseObj;
}