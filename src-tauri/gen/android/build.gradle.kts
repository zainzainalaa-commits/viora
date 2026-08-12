buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        // 2.2 because libmpv is published with Kotlin 2.2 metadata, which a 1.9
        // compiler cannot read at all. The alternative the compiler offers is
        // `-Xskip-metadata-version-check` — telling it to parse a format it does
        // not know and hope. Moving the toolchain forward is the honest version
        // of the same fix.
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

