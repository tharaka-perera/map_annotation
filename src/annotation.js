import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export default function annotation(s) {
    const filename = s.filename;
    const items = s.items

    let annotations = '';
    items.forEach((item) => {
        annotations += `
<object>
    <name>${item.label}</name>
    <bndbox>
        <xmin>${item.left}</xmin>
        <xmax>${item.left + item.width}</xmax>
        <ymin>${item.top}</ymin>
        <ymax>${item.top + item.height}</ymax>
    </bndbox>
</object>`
    });

    return `<annotation>
<folder></folder>
<filename>${s.filename}</filename>
<path>${s.filename}</path>
<size>
    <width>${s.width}</width>
    <height>${s.height}</height>
    <depth>3</depth>
</size>
<segmented>0</segmented>`
        + annotations +
`
</annotation>`;
};