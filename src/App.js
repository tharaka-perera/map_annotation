import "./styles.css";
import React, {useCallback, useEffect, useRef, useState} from "react";
import {GoogleMap, Marker, StandaloneSearchBox, StreetViewPanorama, useJsApiLoader} from '@react-google-maps/api';
import ReactCrop from 'react-image-crop';
import html2canvas from "html2canvas";
import useKeyPress from './useKeyPress';

import 'react-image-crop/dist/ReactCrop.css';
import './custom.css';
import BBoxAnnotator from "react-bbox-annotator";
import annotation from "./annotation";

var CONFIG = require('./config.json');

const TO_RADIANS = Math.PI / 180;

const useDebounceEffect = (
    fn,
    waitTime,
    deps,
) => {
    useEffect(() => {
        const t = setTimeout(() => {
            fn.apply(undefined, deps)
        }, waitTime)

        return () => {
            clearTimeout(t)
        }
    }, deps)
}

const canvasPreview = (
    image,
    canvas,
    crop,
    scale = 1,
    rotate = 0,
) => {
    const ctx = canvas.getContext('2d')

    if (!ctx) {
        throw new Error('No 2d context')
    }

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    // devicePixelRatio slightly increases sharpness on retina devices
    // at the expense of slightly slower render times and needing to
    // size the image back down if you want to download/upload and be
    // true to the images natural size.
    const pixelRatio = window.devicePixelRatio
    // const pixelRatio = 1

    canvas.width = Math.floor(crop.width * scaleX * pixelRatio)
    canvas.height = Math.floor(crop.height * scaleY * pixelRatio)

    ctx.scale(pixelRatio, pixelRatio)
    ctx.imageSmoothingQuality = 'high'

    const cropX = crop.x * scaleX
    const cropY = crop.y * scaleY

    const rotateRads = rotate * TO_RADIANS
    const centerX = image.naturalWidth / 2
    const centerY = image.naturalHeight / 2

    ctx.save()

    // 5) Move the crop origin to the canvas origin (0,0)
    ctx.translate(-cropX, -cropY)
    // 4) Move the origin to the center of the original position
    ctx.translate(centerX, centerY)
    // 3) Rotate around the origin
    ctx.rotate(rotateRads)
    // 2) Scale the image
    ctx.scale(scale, scale)
    // 1) Move the center of the image to the origin (0,0)
    ctx.translate(-centerX, -centerY)
    ctx.drawImage(
        image,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
    )

    ctx.restore()
}

const containerStyle = {
    width: '100%',
    height: '100vh'
};

const libraries = ['places']


export default function App() {
    const labels = ["transformer"];

    const [center, setCenter] = useState({
        lat: -37.8136,
        lng: 144.9631
    });

    const {isLoaded} = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: CONFIG.googleMapsApiKey,
        libraries,
    })

    const [map, setMap] = useState(null)
    const [stView, setStView] = useState(null);
    const [search, setSearch] = useState(null);
    const [stViewCoords, setStViewCoords] = useState(null);

    const onMapLoad = useCallback((map) => {
        setMap(map)
    }, [])

    const onUnmount = useCallback(() => {
        setMap(null)
    }, []);

    const onStVwLoad = (stVw) => {
        setStView(stVw);
    };

    const onStViewChange = () => {
        setStViewCoords({
            lat: stView.getPosition().lat(),
            lng: stView.getPosition().lng(),
            heading: stView.getPov().heading,
            pitch: stView.getPov().pitch,
            zoom: stView.getPov().zoom
        })
    }

    const handleLoad = (ref) => {
        setSearch(ref);
    };

    const onPlacesChanged = () => {
        if (search.getPlaces()?.length === 0) return;
        setCenter(search.getPlaces()[0].geometry.location);
    }

    // taking the screenshot
    const [image, setImage] = useState(null);
    const [screenshot, setScreenshot] = useState(null);
    const [crop, setCrop] = useState(null);
    const [completedCrop, setCompletedCrop] = useState(null);
    const imgRef = useRef(null);
    const croppedCanvas = document.createElement('canvas',);
    const [stage, setStage] = useState(1);
    const mapRef = useRef(null);
    const [entries, setEntries] = useState([]);
    const [fileNum, setFileNum] = useState(1);
    const [downloaded, setDownloaded] = useState(false);
    const searchRef = useRef(null);

    useDebounceEffect(
        async () => {
            if (
                completedCrop?.width &&
                completedCrop?.height &&
                imgRef.current
            ) {
                canvasPreview
                (
                    imgRef.current,
                    croppedCanvas,
                    completedCrop
                )

                const data = croppedCanvas.toDataURL("image/jpeg", 1.0)
                setImage(data);
            }
        },
        100,
        [completedCrop],
    )

    useEffect(() => {
        if (!image && stage !== 2) return;
        setStage(3)
    }, [image])

    const onSave = async () => {
        if (stage === 1) {
            // await takeScreenshot();
            const imgCanvas = await html2canvas(
                mapRef.current,
                {allowTaint: true, useCORS: true},
            );
            const dataURI = imgCanvas.toDataURL("image/jpeg", 1.0)
            setScreenshot(dataURI)
            setStage(2);
        }
    }

    const calculateWidth = () => {
        const imgRatio = completedCrop.width / completedCrop.height;
        const screenRatio = window.innerWidth / window.innerHeight;
        if (imgRatio < screenRatio || completedCrop.width < completedCrop.height) {
            return window.innerHeight / completedCrop.height * completedCrop.width;
        } else {
            return undefined;
        }
    }

    const onReset = () => {
        setCrop(null);
        setDownloaded(false);
        setEntries([]);
        setStage(1);
    }

    const onDownload = () => {
        if (stage !== 3 | downloaded || entries.length === 0) return;
        const imageElement = new Image();
        imageElement.src = image;
        let imWidth;
        let imHeight;
        imWidth = imageElement.width;
        imHeight = imageElement.height;

        imageElement.onload = function () {
            imWidth = imageElement.width;
            imHeight = imageElement.height;

            const inputAnn = {
                items: entries,
                filename: `${Object.values(stViewCoords).join('_')}.jpg`,
                width: imWidth,
                height: imHeight
            };
            const output = annotation(inputAnn);
            const element = document.createElement("a");
            const file = new Blob([output], {type: 'text/plain'});
            element.href = URL.createObjectURL(file);
            element.download = `${Object.values(stViewCoords).join('_')}.xml`;
            // document.body.appendChild(element); // Required for this to work in FireFox
            element.click();

            element.href = image;
            element.download = `${Object.values(stViewCoords).join('_')}.jpg`;
            // document.body.appendChild(element); // Required fsor this to work in FireFox
            element.click();
            setDownloaded(true);
            setFileNum(fileNum + 1);
        };
    }

    // pole coordinate inpuut related logic
    const [poleCoordinatesString, setPoleCoordinatesString] = useState('');
    const [coordListVisibility, setCoordListVisibility] = useState(false);
    const [poleCoordArray, setPoleCoordArray] = useState([]);
    const [stViewCenter, setStViewCenter] = useState({
        lat: -34.940430170000000,
        lng: 138.81630712600000
    });
    const [coordCounter, setCoordCounter] = useState(0);
    const [stViewVisibility, setStViewVisibility] = useState(false);

    const onToggleCoordList = () => {
        setCoordListVisibility(!coordListVisibility);
    }

    useEffect(() => {
        const coordPairs = poleCoordinatesString.split("\n");
        const poleCoords = [];
        coordPairs.forEach((coordStr) => {
            const [lng, lat] = coordStr.split(/[ \t]+/);
            if (/\d/.test(lat) && /\d/.test(lng)) {
                poleCoords.push({lat: parseFloat(lat), lng: parseFloat(lng)});
            }
        });
        setPoleCoordArray(poleCoords);
    }, [poleCoordinatesString]);

    const onJumpToCoordInc = () => {
        if ((poleCoordArray.length - 1) > coordCounter) {
            setStViewVisibility(false);
            setCoordCounter(prevCount => prevCount + 1);
            setStViewCenter(poleCoordArray[coordCounter]);
            setStViewVisibility(true);
        }
    }

    const onJumpToCoordDec = () => {
        if (0 < coordCounter) {
            setStViewVisibility(false);
            setCoordCounter(prevCount => prevCount - 1);
            setStViewCenter(poleCoordArray[coordCounter]);
            setStViewVisibility(true);
        }
    }

    // key press functionality
    useKeyPress(['c'], () => onSave());
    useKeyPress(['r'], () => onReset());
    useKeyPress(['d'], () => onDownload());
    useKeyPress(['l'], () => onToggleCoordList());
    useKeyPress(['n'], () => onJumpToCoordInc());
    useKeyPress(['p'], () => onJumpToCoordDec());


    return isLoaded ? (
        <div className="App" ref={mapRef}>
            {<div style={{display: (stage === 1) ? "block" : "none"}}>
                <GoogleMap
                    mapContainerStyle={containerStyle}
                    center={center}
                    zoom={10}
                    onUnmount={onUnmount}
                    onLoad={onMapLoad}
                    // onDrag={onBoundsChanged}
                >
                    <StreetViewPanorama
                        position={stViewCenter}
                        onLoad={onStVwLoad}
                        onPovChanged={onStViewChange}
                        visible={stViewVisibility}
                    />
                    <StandaloneSearchBox
                        onLoad={handleLoad}
                        onPlacesChanged={onPlacesChanged}
                    >
                        <input
                            type="text"
                            ref={searchRef}
                            placeholder="Location Address"
                            onKeyDown={(e) => {
                                e.stopPropagation()
                            }}
                            style={{
                                boxSizing: `border-box`,
                                border: `1px solid transparent`,
                                width: `240px`,
                                height: `32px`,
                                padding: `0 12px`,
                                borderRadius: `3px`,
                                boxShadow: `0 2px 6px rgba(0, 0, 0, 0.3)`,
                                fontSize: `14px`,
                                outline: `none`,
                                textOverflow: `ellipses`,
                                position: "absolute",
                                left: "50%",
                                marginLeft: "-120px"
                            }}
                        />
                    </StandaloneSearchBox>
                    <Marker position={center}/>
                </GoogleMap>
                <div style={{
                    position: "absolute",
                    width: 300,
                    top: 100,
                    bottom: 100,
                    left: 50,
                    display: coordListVisibility ? 'block' : 'none',
                    zIndex: 100000
                }}>
                    <label>
                        Enter the list of coordinates:
                        <textarea style={{width: '100%', height: '98%'}}
                                  value={poleCoordinatesString}
                                  onChange={e => setPoleCoordinatesString(e.target.value)}/>
                    </label>
                </div>
            </div>
            }
            <div>
                {stage === 2 && (
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => {
                            if (c?.width) {
                                setCompletedCrop(c);
                            }
                        }}
                    >
                        <img
                            ref={imgRef}
                            alt="Crop me"
                            src={screenshot}
                            // onLoad={onImageLoad}
                        />
                    </ReactCrop>
                )}
            </div>
            {stage === 3 && (<div
                    style={{
                        width: calculateWidth(),
                        margin: 'auto',
                    }}>
                    <BBoxAnnotator
                        url={image}
                        inputMethod="select"
                        labels={labels}
                        onChange={(e) => {
                            if (e.length > 0) {
                                setEntries(e);
                            } else {
                                setEntries([]);
                            }
                        }}
                    />
                </div>
            )}
        </div>
    ) : <></>
}
