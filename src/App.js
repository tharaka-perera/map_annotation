import "./styles.css";
import React, {useEffect, useRef, useState} from "react";
import {GoogleMap, Marker, StandaloneSearchBox, useJsApiLoader} from '@react-google-maps/api';
import ReactCrop from 'react-image-crop'
import html2canvas from "html2canvas";
import useKeyPress from './useKeyPress';

import 'react-image-crop/dist/ReactCrop.css'
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


export default function App() {
    const labels = ["label1", "label2", "label3"];

    const [center, setCenter] = useState({
        lat: -37.8136,
        lng: 144.9631
    });

    const {isLoaded} = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: CONFIG.googleMapsApiKey,
        libraries: ["places"],
    })

    const [map, setMap] = React.useState(null)
    const [search, setSearch] = useState(null);

    const onUnmount = React.useCallback(function callback(map) {
        setMap(null)
    }, []);


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
    const blobUrlRef = useRef('');
    const imgRef = useRef(null);
    const [aspect, setAspect] = useState(undefined);
    const previewCanvasRef = useRef(null)
    const croppedCanvas = document.createElement('canvas',);
    const [readyToCrop, setReadyToCrop] = useState(false);
    const [stage, setStage] = useState(1);
    const mapRef = useRef(null);
    const [entries, setEntries] = useState([]);
    const [fileNum, setFileNum] = useState(1);
    const [downloaded, setDownloaded] = useState(false);
    const searchRef = useRef(null);


    // const startCapture = async (displayMediaOptions) => {
    //     let captureStream;
    //     try {
    //         captureStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    //     } catch (err) {
    //         console.error(`Error: ${err}`);
    //     }
    //     return captureStream;
    // }

    // const takeScreenshot = async () => {
    //     const stream = await startCapture({ video: true, preferCurrentTab: true });
    //     const video = document.createElement('video');
    //     video.srcObject = stream;
    //     const drawProm = new Promise((resolve, _) => video.onloadedmetadata = () => {
    //         video.play();
    //         const canvas = document.createElement('canvas');
    //         canvas.width = video.videoWidth;
    //         canvas.height = video.videoHeight;
    //         const ctx = canvas.getContext('2d');
    //         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    //         setScreenshot(canvas.toDataURL("image/jpeg", 1.0));
    //         stream.getTracks().forEach(track => track.stop());
    //         resolve();
    //     });
    //     await drawProm;
    // };
    //
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
                // This is a very important line as it allows to capture an image of Google Maps!
                {allowTaint: true, useCORS: true},
            );
            const dataURI = imgCanvas.toDataURL("image/jpeg", 1.0)
            setScreenshot(dataURI)
            setStage(2);
        }
    }

    const onReset = () => {
        setCrop(null);
        setDownloaded(false);
        setEntries([]);
        setStage(1);
    }

    const onDownload = () => {
        if (stage !== 3 | downloaded | entries.length === 0) return;
        const imageElement = new Image();
        imageElement.src = image;
        let imWidth;
        let imHeight;
        imWidth = imageElement.width;
        imHeight = imageElement.height;

        // const inputAnn = { items: entries, filename: 'testfile.jpg', width: imWidth, height: imHeight};
        // const output = annotation(inputAnn);
        // // console.log(output);
        // const element = document.createElement("a");
        // const file = new Blob([output], {type: 'text/plain'});
        // element.href = URL.createObjectURL(file);
        // element.download = "testfile.xml";
        // // document.body.appendChild(element); // Required for this to work in FireFox
        // element.click();
        //
        // element.href = image;
        // element.download = "testfile.jpg";
        // document.body.appendChild(element); // Required for this to work in FireFox
        // element.click();
        imageElement.onload = function () {
            imWidth = imageElement.width;
            imHeight = imageElement.height;

            const inputAnn = { items: entries, filename: `annotate_${fileNum}.jpg`, width: imWidth, height: imHeight};
            const output = annotation(inputAnn);
            // console.log(output);
            const element = document.createElement("a");
            const file = new Blob([output], {type: 'text/plain'});
            element.href = URL.createObjectURL(file);
            element.download = `annotate_${fileNum}.xml`;
            // document.body.appendChild(element); // Required for this to work in FireFox
            element.click();

            element.href = image;
            element.download = `annotate_${fileNum}.jpg`;
            // document.body.appendChild(element); // Required fsor this to work in FireFox
            element.click();
            setDownloaded(true);
            setFileNum(fileNum+1);
        };
    }

    // key press functionality
    useKeyPress(['s'], () => onSave());
    useKeyPress(['r'], () => onReset());
    useKeyPress(['d'], () => onDownload());



    return isLoaded ? (
        <div className="App" ref={mapRef}>
            {<div style={{display: (stage === 1) ? "block" : "none"}}>
                <GoogleMap
                    mapContainerStyle={containerStyle}
                    center={center}
                    zoom={10}
                    // onLoad={onLoad}
                    onUnmount={onUnmount}>
                    <StandaloneSearchBox
                        onLoad={handleLoad}
                        onPlacesChanged={onPlacesChanged}
                    >
                        <input
                            type="text"
                            ref={searchRef}
                            placeholder="Location Address"
                            onKeyDown={(e) => {e.stopPropagation()}}
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
            {stage === 3 && ( <>
                <BBoxAnnotator
                    url={image}
                    inputMethod="select"
                    labels={labels}
                    onChange={(e) => {
                        if (e.length > 0) {
                            setEntries(e);
                            // console.log(e)
                            //     var bbox = {};
                            //     bbox.width = e[0].width / 805;
                            //     bbox.top = e[0].top / 1043;
                            //     bbox.left = e[0].left / 805;
                            //     bbox.height = e[0].height / 1043;
                            //     console.log(bbox.width, bbox.top, bbox.left, bbox.height);
                            // x1 = bbox.left;
                            // y1 = bbox.top;
                            // x2 = bbox.left + bbox.width;
                            // y2 = bbox.top + bbox.height;
                            //console.log(x1 + "," + y1 + "," + x2 + "," + y2);
                        } else {
                            setEntries([]);
                        }
                    }}
                />

                    {/*<pre>{JSON.stringify(entries)}</pre>*/}
                </>
            )}
        </div>
    ) : <></>
}
