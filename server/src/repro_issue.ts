
import { FileStore } from './utils/file-store.js';
import path from 'path';

async function test() {
    const id = '20260214_183837_JavaScript_Essentials_for_Everyone';
    console.log(`Testing loadCourse with ID: ${id}`);

    try {
        const course = await FileStore.loadCourse(id);
        if (course) {
            console.log('Course loaded successfully!');
            console.log('Has outline:', !!course.outline);
        } else {
            console.error('Course not found (returned null)');
        }
    } catch (error) {
        console.error('Error loading course:', error);
    }
}

test();
